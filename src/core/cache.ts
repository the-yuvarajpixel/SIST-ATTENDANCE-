import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export interface CacheEntry<T> {
  value: T;
  fetchedAt: number;
  ttlMs: number;
}

export interface CacheFetchResult<T> {
  data: T;
  stale: boolean;
  fetchedAt: string;
  warning?: string;
}

/**
 * Two-tier cache (in-memory Map + optional JSON file persistence) with:
 * - Per-user SHA-256 scoped keys
 * - In-flight promise deduplication
 * - Stale-while-error fallback when upstream ERP/LMS fails
 */
export class TwoTierCache {
  private readonly memory = new Map<string, CacheEntry<unknown>>();
  private readonly inFlight = new Map<string, Promise<CacheFetchResult<unknown>>>();
  private readonly diskPath: string | null;

  constructor(diskPath?: string | null) {
    this.diskPath = diskPath ?? null;
    this.hydrateFromDisk();
  }

  static hashUserKey(registerNumber: string): string {
    return crypto.createHash('sha256').update(registerNumber.trim().toLowerCase()).digest('hex').slice(0, 16);
  }

  private buildKey(userHash: string, section: string): string {
    return `${encodeURIComponent(userHash)}:${section}`;
  }

  private hydrateFromDisk(): void {
    if (!this.diskPath) return;
    try {
      if (!fs.existsSync(this.diskPath)) return;
      const raw = fs.readFileSync(this.diskPath, 'utf8');
      const parsed = JSON.parse(raw) as Record<string, CacheEntry<unknown>>;
      for (const [k, v] of Object.entries(parsed)) {
        if (v && typeof v.fetchedAt === 'number' && typeof v.ttlMs === 'number') {
          if (Number.isFinite(v.fetchedAt) && Number.isFinite(v.ttlMs) && v.ttlMs >= 0 && this.memory.size < 2048) this.memory.set(k, v);
        }
      }
    } catch {
      // Ignore corrupt cache file; fresh fetches will overwrite it.
    }
  }

  private persistToDisk(): void {
    if (!this.diskPath) return;
    try {
      fs.mkdirSync(path.dirname(this.diskPath), { recursive: true });
      const serializable: Record<string, CacheEntry<unknown>> = {};
      for (const [k, v] of this.memory.entries()) {
        serializable[k] = v;
      }
      const temporary = `${this.diskPath}.${crypto.randomUUID()}.tmp`;
      try {
        fs.writeFileSync(temporary, JSON.stringify(serializable), { encoding: 'utf8', mode: 0o600 });
        fs.renameSync(temporary, this.diskPath);
      } finally {
        fs.rmSync(temporary, { force: true });
      }
    } catch {
      // Disk tier is best-effort; memory tier remains authoritative.
    }
  }

  async getOrFetch<T>(
    userHash: string,
    section: string,
    ttlMs: number,
    fetcher: () => Promise<T>,
    options: { forceRefresh?: boolean; now?: number } = {}
  ): Promise<CacheFetchResult<T>> {
    const key = this.buildKey(userHash, section);
    const now = options.now ?? Date.now();
    const cached = this.memory.get(key) as CacheEntry<T> | undefined;

    if (!options.forceRefresh && cached && now - cached.fetchedAt < cached.ttlMs) {
      return {
        data: cached.value,
        stale: false,
        fetchedAt: new Date(cached.fetchedAt).toISOString(),
      };
    }

    const existingFlight = this.inFlight.get(key) as Promise<CacheFetchResult<T>> | undefined;
    if (existingFlight) {
      return existingFlight;
    }

    const promise = Promise.resolve().then(async (): Promise<CacheFetchResult<T>> => {
      try {
        const fresh = await fetcher();
        const ts = options.now ?? Date.now();
        if (this.inFlight.get(key) === promise) {
          if (this.memory.size >= 2048 && !this.memory.has(key)) this.memory.delete(this.memory.keys().next().value!);
          this.memory.set(key, { value: fresh, fetchedAt: ts, ttlMs });
        }
        this.persistToDisk();
        return {
          data: fresh,
          stale: false,
          fetchedAt: new Date(ts).toISOString(),
        };
      } catch (err) {
        if (cached) {
          const message = err instanceof Error ? err.message : 'Upstream portal unavailable';
          return {
            data: cached.value,
            stale: true,
            fetchedAt: new Date(cached.fetchedAt).toISOString(),
            warning: `Showing last cached copy because upstream refresh failed (${message}).`,
          };
        }
        throw err;
      } finally {
        if (this.inFlight.get(key) === promise) this.inFlight.delete(key);
      }
    });

    this.inFlight.set(key, promise as Promise<CacheFetchResult<unknown>>);
    return promise;
  }

  clearUser(userHash: string): number {
    const prefix = `${encodeURIComponent(userHash)}:`;
    for (const key of this.inFlight.keys()) if (key.startsWith(prefix)) this.inFlight.delete(key);
    let removed = 0;
    for (const key of Array.from(this.memory.keys())) {
      if (key.startsWith(prefix)) {
        this.memory.delete(key);
        removed += 1;
      }
    }
    if (removed > 0) this.persistToDisk();
    return removed;
  }

  stats(): { entries: number; diskBacked: boolean } {
    return { entries: this.memory.size, diskBacked: Boolean(this.diskPath) };
  }
}
