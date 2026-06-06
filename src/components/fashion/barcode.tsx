import { code39Bars, code39Width } from '@/lib/fashion/barcode39';

/** Renders a scannable Code 39 barcode of `value` as inline SVG (no deps, prints
 *  cleanly on thermal and A4). The human-readable value is shown beneath. */
export function Barcode39({
  value,
  height = 40,
  module = 2,
  className,
}: {
  value: string;
  /** Bar height in px. */
  height?: number;
  /** Narrow-bar width in px. */
  module?: number;
  className?: string;
}) {
  const els = code39Bars(value);
  const totalModules = code39Width(els);
  const width = totalModules * module;

  let x = 0;
  const rects = els.map((el, i) => {
    const w = el.width * module;
    const rect = el.bar ? <rect key={i} x={x} y={0} width={w} height={height} fill="#000" /> : null;
    x += w;
    return rect;
  });

  return (
    <span className={className}>
      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="none"
        role="img"
        aria-label={value}
        className="max-w-full"
      >
        {rects}
      </svg>
      <span className="mt-0.5 block text-center font-mono text-[10px] tracking-widest" dir="ltr">{value}</span>
    </span>
  );
}
