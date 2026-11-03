import { memo } from 'react';
import type { Product } from '../types';

export default memo(function FurnitureSymbol({
  product,
}: {
  product: Product;
}) {
  const w = product.width_m,
    d = product.depth_m;
  const inset = Math.min(w, d) * 0.08;
  const color = product.color;
  const category = product.category;
  const base = (
    <rect
      x={0.015}
      y={0.015}
      width={w - 0.03}
      height={d - 0.03}
      rx={Math.min(0.08, w * 0.1)}
      fill={color}
      fillOpacity="0.34"
    />
  );
  if (category === 'sofa') {
    const arms = Math.min(w * 0.09, 0.14),
      back = d * 0.2,
      count = w > 1.9 ? 3 : 2;
    return (
      <g className="architectural-symbol">
        {base}
        <rect x="0" y="0" width={w} height={back} rx="0.05" />
        <rect x="0" y="0" width={arms} height={d} rx="0.04" />
        <rect x={w - arms} y="0" width={arms} height={d} rx="0.04" />
        {Array.from({ length: count }, (_, i) => (
          <rect
            key={i}
            x={arms + (i * (w - 2 * arms)) / count + 0.02}
            y={back + 0.025}
            width={(w - 2 * arms) / count - 0.04}
            height={d - back - 0.055}
            rx="0.045"
            fill={color}
            fillOpacity="0.36"
          />
        ))}
      </g>
    );
  }
  if (category === 'bed')
    return (
      <g className="architectural-symbol">
        {base}
        <rect
          x="0"
          y="0"
          width={w}
          height={Math.min(0.12, d * 0.1)}
          rx="0.025"
          fill={color}
        />
        <rect
          x={inset}
          y={inset}
          width={w - inset * 2}
          height={d - inset * 2}
          rx="0.08"
        />
        <rect
          x={inset}
          y={d * 0.29}
          width={w - inset * 2}
          height={d * 0.63}
          rx="0.04"
          fill={color}
          fillOpacity="0.4"
        />
        {[0, 1].map((i) => (
          <rect
            key={i}
            x={inset * 1.5 + (i * (w - inset * 3)) / 2}
            y={inset * 1.5}
            width={(w - inset * 4) / 2}
            height={d * 0.16}
            rx="0.06"
          />
        ))}
        <path d={`M${inset} ${d * 0.76}H${w - inset}`} />
      </g>
    );
  if (category === 'chair')
    return (
      <g className="architectural-symbol">
        {base}
        <rect
          x={inset}
          y={d * 0.12}
          width={w - inset * 2}
          height={d * 0.76}
          rx={Math.min(0.15, w / 4)}
          fill={color}
          fillOpacity="0.45"
        />
        <path
          d={`M${inset} ${d * 0.22}V${inset}Q${w / 2} ${-inset * 0.1} ${w - inset} ${inset}V${d * 0.22}`}
        />
      </g>
    );
  if (category === 'lighting')
    return (
      <g className="architectural-symbol">
        <circle
          cx={w / 2}
          cy={d / 2}
          r={Math.min(w, d) * 0.43}
          fill={color}
          fillOpacity="0.4"
        />
        <circle cx={w / 2} cy={d / 2} r={Math.min(w, d) * 0.12} />
        <path d={`M${w / 2} 0V${d}M0 ${d / 2}H${w}`} opacity=".5" />
      </g>
    );
  if (category === 'toilet')
    return (
      <g className="architectural-symbol">
        <rect
          x={w * 0.04}
          y={d * 0.02}
          width={w * 0.92}
          height={d * 0.25}
          rx=".03"
        />
        <ellipse
          cx={w / 2}
          cy={d * 0.59}
          rx={w * 0.45}
          ry={d * 0.37}
          fill="#e4e5d5"
          fillOpacity=".5"
        />
        <ellipse cx={w / 2} cy={d * 0.57} rx={w * 0.27} ry={d * 0.25} />
      </g>
    );
  if (category === 'shower')
    return (
      <g className="architectural-symbol">
        {base}
        <rect
          x={inset}
          y={inset}
          width={w - inset * 2}
          height={d - inset * 2}
        />
        <path
          d={`M${inset} ${inset}L${w / 2} ${d / 2}L${w - inset} ${inset}M${inset} ${d - inset}L${w / 2} ${d / 2}L${w - inset} ${d - inset}`}
          opacity=".45"
        />
        <circle cx={w / 2} cy={d / 2} r=".035" />
      </g>
    );
  if (
    category === 'vanity' ||
    (category === 'storage' && product.room_types.includes('kitchen'))
  )
    return (
      <g className="architectural-symbol">
        {base}
        <rect x="0" y="0" width={w} height={d} rx=".025" />
        {category === 'vanity' ? (
          <>
            <rect
              x={w * 0.2}
              y={d * 0.2}
              width={w * 0.6}
              height={d * 0.6}
              rx=".08"
            />
            <circle cx={w / 2} cy={d * 0.55} r=".025" />
            <path d={`M${w / 2} ${d * 0.04}V${d * 0.24}`} />
          </>
        ) : (
          <>
            <rect
              x={w * 0.12}
              y={d * 0.16}
              width={w * 0.32}
              height={d * 0.68}
              rx=".05"
            />
            <path d={`M${w * 0.28} ${d * 0.06}V${d * 0.26}`} />
            {[0.65, 0.84].flatMap((x) =>
              [0.3, 0.7].map((y) => (
                <circle
                  key={`${x}-${y}`}
                  cx={w * x}
                  cy={d * y}
                  r={Math.min(w * 0.065, d * 0.12)}
                />
              )),
            )}
          </>
        )}
      </g>
    );
  if (category === 'storage')
    return (
      <g className="architectural-symbol">
        {base}
        <rect width={w} height={d} />
        <path
          d={`M${w / 2} 0V${d}M0 0L${w / 2} ${d}L${w} 0M${w * 0.45} ${d * 0.45}V${d * 0.65}M${w * 0.55} ${d * 0.45}V${d * 0.65}`}
        />
      </g>
    );
  if (category === 'rug')
    return (
      <g className="architectural-symbol">
        <rect
          x="0"
          y="0"
          width={w}
          height={d}
          rx=".025"
          fill={color}
          fillOpacity=".25"
          strokeDasharray=".025 .015"
        />
        <rect
          x={inset}
          y={inset}
          width={w - inset * 2}
          height={d - inset * 2}
          opacity=".5"
        />
      </g>
    );
  return (
    <g className="architectural-symbol">
      {base}
      <rect
        x="0"
        y="0"
        width={w}
        height={d}
        rx={category === 'table' ? Math.min(w, d) * 0.12 : 0.025}
      />
      {[
        [0.1, 0.12],
        [0.9, 0.12],
        [0.1, 0.88],
        [0.9, 0.88],
      ].map(([x, y], i) => (
        <rect
          key={i}
          x={w * x - 0.025}
          y={d * y - 0.025}
          width=".05"
          height=".05"
          fill={color}
        />
      ))}
    </g>
  );
});
