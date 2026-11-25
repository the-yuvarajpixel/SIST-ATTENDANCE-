export function formatShortDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
  });
}

export function formatDateTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString('en-IN', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
}

export function formatExamDateTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  const datePart = date.toLocaleDateString('en-IN', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
  const timePart = date.toLocaleTimeString('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
  return `${datePart} · ${timePart}`;
}

export function formatRelativeDue(iso: string, now = new Date()): {
  label: string;
  urgency: 'overdue' | 'soon' | 'upcoming';
} {
  const due = new Date(iso);
  const diffMs = due.getTime() - now.getTime();
  const diffHours = Math.round(diffMs / (1000 * 60 * 60));
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

  if (diffMs < 0) {
    const overdueDays = Math.max(1, Math.floor(Math.abs(diffMs) / (1000 * 60 * 60 * 24)));
    return { label: `Overdue by ${overdueDays}d`, urgency: 'overdue' };
  }
  if (diffHours <= 24) {
    return { label: diffHours <= 1 ? 'Due within 1h' : `Due in ${diffHours}h`, urgency: 'soon' };
  }
  if (diffDays <= 3) {
    return { label: `Due in ${diffDays} days`, urgency: 'soon' };
  }
  return { label: `In ${diffDays} days`, urgency: 'upcoming' };
}

export function formatInr(amount: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(amount);
}
