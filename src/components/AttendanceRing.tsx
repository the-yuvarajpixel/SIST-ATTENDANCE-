interface AttendanceRingProps {
  percentage: number;
  targetPercent: number;
  size?: number;
  strokeWidth?: number;
  label?: string;
}

/**
 * Crisp SVG circular progress gauge visualizing attendance against the active minimum threshold
 * (default 80%), with emerald (>= target with cushion), amber (borderline), and rose (< target) states.
 */
export function AttendanceRing({
  percentage,
  targetPercent,
  size = 112,
  strokeWidth = 9,
  label = 'Overall',
}: AttendanceRingProps) {
  const clamped = Math.min(100, Math.max(0, percentage));
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference - (clamped / 100) * circumference;

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

  const isShortage = clamped < targetPercent;
  const isBorderline = !isShortage && clamped < targetPercent + 3;

  const strokeClass = isShortage
    ? 'stroke-rose-600 dark:stroke-rose-500'
    : isBorderline
      ? 'stroke-amber-500 dark:stroke-amber-400'
      : 'stroke-emerald-600 dark:stroke-emerald-500';

  const valueTextClass = isShortage
    ? 'text-rose-700 dark:text-rose-400'
    : isBorderline
      ? 'text-amber-700 dark:text-amber-400'
      : 'text-emerald-700 dark:text-emerald-400';

  return (
    <div
      className="relative inline-flex items-center justify-center shrink-0"
      style={{ width: size, height: size }}
      role="img"
      aria-label={`${label} attendance ${clamped.toFixed(1)}% against ${targetPercent}% requirement`}
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
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center pointer-events-none">
        <span className={`font-mono text-lg sm:text-xl font-bold tabular-nums leading-none ${valueTextClass}`}>
          {clamped.toFixed(1)}%
        </span>
        <span className="mt-1 font-mono text-[10px] font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
          {targetPercent}% line
        </span>
      </div>
    </div>
  );
}
