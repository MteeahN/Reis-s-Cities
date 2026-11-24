import type { ReactElement } from 'react';
import type { RoadTypeDef } from '../../game/data/roads';

/**
 * Top-down drawing of a road type for its catalogue card, drawn from the
 * type's real numbers: width, sidewalks, median, lane count and direction.
 */
export function RoadSketch({ t }: { t: RoadTypeDef }) {
  const W = 120;
  const H = 64;
  const scale = Math.min(2.2, (H - 8) / t.width);
  const total = t.width * scale;
  const top = (H - total) / 2;
  const side = t.sidewalk * scale;
  const median = t.median * scale;
  const asphaltTop = top + side;
  const asphaltH = total - side * 2;
  const laneH = (asphaltH - median) / t.lanes;
  const lines: ReactElement[] = [];
  const arrows: ReactElement[] = [];
  for (let l = 0; l < t.lanes; l++) {
    const twoWayHalf = Math.floor(t.lanes / 2);
    const beforeMedian = !t.oneWay && l >= twoWayHalf ? median : 0;
    const y = asphaltTop + beforeMedian + l * laneH;
    const forward = t.oneWay || l >= twoWayHalf;
    const cy = y + laneH / 2;
    const x0 = forward ? 70 : 50;
    arrows.push(
      <path
        key={`a${l}`}
        d={forward ? `M${x0 - 10} ${cy} H${x0 + 6} M${x0 + 2} ${cy - 3} L${x0 + 6} ${cy} L${x0 + 2} ${cy + 3}` : `M${x0 + 10} ${cy} H${x0 - 6} M${x0 - 2} ${cy - 3} L${x0 - 6} ${cy} L${x0 - 2} ${cy + 3}`}
        stroke="#f8f5ec"
        strokeWidth={1.4}
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />,
    );
    if (l > 0) {
      const centre = !t.oneWay && l === twoWayHalf;
      if (centre && median > 0) continue;
      lines.push(
        <line
          key={`l${l}`}
          x1={0}
          x2={W}
          y1={y}
          y2={y}
          stroke={centre && t.centerLine === 'double' ? '#f2c14e' : '#f8f5ec'}
          strokeWidth={1}
          strokeDasharray={centre && t.centerLine !== 'dashed' ? undefined : '6 5'}
        />,
      );
    }
  }
  const medianY = asphaltTop + Math.floor(t.lanes / 2) * laneH;
  return (
    <svg className="road-sketch" viewBox={`0 0 ${W} ${H}`} aria-hidden>
      <rect x={0} y={0} width={W} height={H} fill="#a9cf7f" />
      {side > 0 && (
        <>
          <rect x={0} y={top} width={W} height={side} fill="#d9d4c7" />
          <rect x={0} y={top + total - side} width={W} height={side} fill="#d9d4c7" />
        </>
      )}
      <rect x={0} y={asphaltTop} width={W} height={asphaltH} fill="#4b4f57" />
      {median > 0 && !t.oneWay && (
        <>
          <rect x={0} y={medianY} width={W} height={median} fill="#7fb35a" />
          {[18, 60, 102].map((x) => (
            <circle key={x} cx={x} cy={medianY + median / 2} r={Math.max(2.5, median / 1.6)} fill="#4f8a3a" stroke="#2a3b22" strokeWidth={0.8} />
          ))}
        </>
      )}
      {lines}
      {arrows}
      <rect x={0.5} y={top} width={W - 1} height={total} fill="none" stroke="#2a2622" strokeWidth={1} />
    </svg>
  );
}
