import type { AttendanceColorBand } from '../core/attendanceCalculator';

interface AttendanceRingProps {
  percentage: number;
  targetPercent: number;
  band?: AttendanceColorBand;
  hasClasses?: boolean;
  size?: number;
  strokeWidth?: number;
  label?: string;
}

/**
 * Crisp SVG circular progress gauge visualizing attendance against the active minimum threshold
 * (default 80%), displaying percentages to 2 decimal places with exact semantic color bands:
 * - Green: strictly above 83% (target + 3)
 * - Amber: 80%–83% inclusive (target .. target + 3)
 * - Red: below 80% (< target)
 */
export function AttendanceRing({
  percentage,
  targetPercent,
  band,
  hasClasses = true,
  size = 112,
  strokeWidth = 9,
  label = 'Overall',
}: AttendanceRingProps) {
  const safePct = Number.isFinite(percentage) ? Math.min(100, Math.max(0, percentage)) : 0;
  const effectivePct = hasClasses ? safePct : 0;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference - (effectivePct / 100) * circumference;

  // Threshold tick angle on the ring (0% starts at top = -90deg)
  const targetAngleRad = ((targetPercent / 100) * 360 - 90) * (Math.PI / 180);
  const cx = size / 2;
  const cy = size / 2;
  const innerTick = radius - strokeWidth * 0.55;
  const outerTick = radius + strokeWidth * 0.55;
  const tx1 = cx + innerTick * Math.cos(targetAngleRad);
  const ty1 = cy + innerTick * Math.sin(targetAngleRad);
  const tx2 = cx + outerTick * Math.cos(targetAngleRad);
  const ty2 = cy + outerTick * Math.sin(targetAngleRad);

  const resolvedBand: AttendanceColorBand =
    band ??
    (!hasClasses
      ? 'neutral'
      : safePct < targetPercent
        ? 'red'
        : safePct <= targetPercent + 3
          ? 'amber'
          : 'green');

  const strokeClass =
    resolvedBand === 'red'
      ? 'stroke-rose-600 dark:stroke-rose-500'
      : resolvedBand === 'amber'
        ? 'stroke-amber-500 dark:stroke-amber-400'
        : resolvedBand === 'green'
          ? 'stroke-emerald-600 dark:stroke-emerald-500'
          : 'stroke-slate-400 dark:stroke-slate-600';

  const valueTextClass =
    resolvedBand === 'red'
      ? 'text-rose-700 dark:text-rose-400'
      : resolvedBand === 'amber'
        ? 'text-amber-700 dark:text-amber-400'
        : resolvedBand === 'green'
          ? 'text-emerald-700 dark:text-emerald-400'
          : 'text-slate-600 dark:text-slate-400';

  const displayPercent = hasClasses ? `${safePct.toFixed(2)}%` : '0.00%';

  return (
    <div
      className="relative inline-flex items-center justify-center shrink-0"
      style={{ width: size, height: size }}
      role="img"
      aria-label={`${label} attendance ${displayPercent} against ${targetPercent}% requirement`}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="overflow-visible">
        <circle
          cx={cx}
          cy={cy}
          r={radius}
          fill="none"
          strokeWidth={strokeWidth}
          className="stroke-slate-200/90 dark:stroke-slate-800"
        />
        <circle
          cx={cx}
          cy={cy}
          r={radius}
          fill="none"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={dashOffset}
          transform={`rotate(-90 ${cx} ${cy})`}
          className={`${strokeClass} transition-[stroke-dashoffset] duration-300 ease-out`}
        />
        <line
          x1={tx1}
          y1={ty1}
          x2={tx2}
          y2={ty2}
          strokeWidth={2}
          strokeLinecap="round"
          className="stroke-slate-900 dark:stroke-slate-100"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center pointer-events-none px-2">
        <span className={`font-mono text-base sm:text-lg font-bold tabular-nums leading-none ${valueTextClass}`}>
          {displayPercent}
        </span>
        <span className="mt-1 font-mono text-[10px] font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
          {targetPercent}% line
        </span>
      </div>
    </div>
  );
}
