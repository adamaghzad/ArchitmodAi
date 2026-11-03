import { useEffect, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import FurnitureSymbol from './editor2d/FurnitureSymbol';
import { openingPose, rotateAtCentre } from './sceneGeometry';
import type { EditorTool } from './editorTypes';
import type { Furniture, Operation, Point } from './types';
import type { Project, Scene, Product } from './types';
import { area, centre } from './geometry';

interface Props {
  scene: Scene;
  reference: Project['reference'];
  products: Product[];
  selected: string | null;
  onSelect: (id: string) => void;
  zoom: number;
  showReference: boolean;
  perception: Project['perception'];
  tool?: EditorTool;
  onEdit?: (operation: Operation) => Promise<void>;
  onZoom?: (zoom: number) => void;
  busy?: boolean;
  showFurniture?: boolean;
}

export default function PlanView({
  scene,
  reference,
  products,
  selected,
  onSelect,
  zoom,
  showReference,
  perception,
  tool = 'select',
  onEdit,
  onZoom,
  busy = false,
  showFurniture = true,
}: Props) {
  const margin = 1;
  const viewWidth = scene.width_m + margin * 2;
  const viewDepth = scene.depth_m + margin * 2;
  const ref = useRef<SVGSVGElement>(null);
  const [pan, setPan] = useState<Point>([0, 0]);
  const [draft, setDraft] = useState<Furniture | null>(null);
  const [measure, setMeasure] = useState<Point[]>([]);
  const gesture = useRef<{
    mode: 'pan' | 'move';
    client: Point;
    start: Point;
    origin: Point;
    item?: Furniture;
    units: number;
  } | null>(null);
  useEffect(() => {
    const svg = ref.current;
    if (!svg || !onZoom) return;
    const wheel = (event: WheelEvent) => {
      event.preventDefault();
      onZoom(Math.max(0.4, Math.min(3, zoom * (event.deltaY > 0 ? 0.9 : 1.1))));
    };
    svg.addEventListener('wheel', wheel, { passive: false });
    return () => svg.removeEventListener('wheel', wheel);
  }, [onZoom, zoom]);
  const point = (event: ReactPointerEvent): Point => {
    const svg = ref.current!;
    const p = svg.createSVGPoint();
    p.x = event.clientX;
    p.y = event.clientY;
    const matrix = svg.getScreenCTM();
    if (!matrix) return [0, 0];
    const local = p.matrixTransform(matrix.inverse());
    return [local.x, local.y];
  };
  const beginObject = (
    event: ReactPointerEvent,
    item: Furniture,
    product: Product,
  ) => {
    if (busy || tool === 'pan' || tool === 'measure') return;
    event.stopPropagation();
    onSelect(item.id);
    if (tool === 'rotate' && onEdit) {
      const rotated = rotateAtCentre(item, product);
      void onEdit({
        type: 'move_furniture',
        object_id: item.id,
        position: rotated.position,
        rotation_deg: rotated.rotation_deg,
      });
    } else if (tool === 'move' && onEdit) {
      ref.current?.setPointerCapture(event.pointerId);
      gesture.current = {
        mode: 'move',
        client: [event.clientX, event.clientY],
        start: point(event),
        origin: item.position,
        item,
        units: 1,
      };
      setDraft(item);
    }
  };
  return (
    <svg
      ref={ref}
      className={`plan-svg tool-${tool}`}
      role="img"
      aria-label="Editable 2D floor plan"
      viewBox={`${scene.width_m / 2 - viewWidth / zoom / 2 + pan[0]} ${scene.depth_m / 2 - viewDepth / zoom / 2 + pan[1]} ${viewWidth / zoom} ${viewDepth / zoom}`}
      onPointerDown={(event) => {
        if (tool === 'measure') {
          const p = point(event);
          setMeasure((previous) =>
            previous.length === 1 ? [...previous, p] : [p],
          );
        }
        if (tool === 'pan' || event.button === 1) {
          ref.current?.setPointerCapture(event.pointerId);
          gesture.current = {
            mode: 'pan',
            client: [event.clientX, event.clientY],
            origin: pan,
            start: point(event),
            units: 1 / (ref.current?.getScreenCTM()?.a || 1),
          };
        }
      }}
      onPointerMove={(event) => {
        const active = gesture.current;
        if (!active) return;
        if (active.mode === 'pan')
          setPan([
            active.origin[0] -
              (event.clientX - active.client[0]) * active.units,
            active.origin[1] -
              (event.clientY - active.client[1]) * active.units,
          ]);
        else if (active.item) {
          const p = point(event);
          setDraft({
            ...active.item,
            position: [
              Math.round((active.origin[0] + p[0] - active.start[0]) * 100) /
                100,
              Math.round((active.origin[1] + p[1] - active.start[1]) * 100) /
                100,
            ],
          });
        }
      }}
      onPointerUp={(event) => {
        if (ref.current?.hasPointerCapture(event.pointerId))
          ref.current.releasePointerCapture(event.pointerId);
        const active = gesture.current;
        gesture.current = null;
        if (
          active?.mode === 'move' &&
          draft &&
          onEdit &&
          Math.hypot(
            draft.position[0] - active.origin[0],
            draft.position[1] - active.origin[1],
          ) > 0.005
        )
          void onEdit({
            type: 'move_furniture',
            object_id: draft.id,
            position: draft.position,
            rotation_deg: draft.rotation_deg,
          }).finally(() => setDraft(null));
        else setDraft(null);
      }}
      onPointerCancel={() => {
        gesture.current = null;
        setDraft(null);
      }}
    >
      <defs>
        <pattern
          id="floor-hatch"
          width="0.35"
          height="0.35"
          patternUnits="userSpaceOnUse"
          patternTransform="rotate(45)"
        >
          <line
            x1="0"
            y1="0"
            x2="0"
            y2="0.35"
            stroke="#ffffff"
            strokeOpacity="0.07"
            strokeWidth="0.01"
          />
        </pattern>
      </defs>
      <rect
        x="-0.02"
        y="-0.02"
        width={scene.width_m + 0.04}
        height={scene.depth_m + 0.04}
        fill="#27322d"
      />
      {scene.rooms.map((room) => {
        return (
          <g
            key={room.id}
            className="room-shape"
            role="button"
            tabIndex={0}
            aria-label={`Select ${room.name}`}
            onClick={() => onSelect(room.id)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                onSelect(room.id);
              }
            }}
          >
            <polygon
              points={room.polygon.map((p) => p.join(',')).join(' ')}
              fill={room.color}
              fillOpacity={selected === room.id ? 0.38 : 0.17}
              stroke={selected === room.id ? '#d1ebbe' : 'none'}
              strokeWidth="0.035"
            />
            <polygon
              points={room.polygon.map((p) => p.join(',')).join(' ')}
              fill="url(#floor-hatch)"
            />
          </g>
        );
      })}
      {reference && showReference && (
        <image
          href={reference.url}
          x="0"
          y="0"
          width={scene.width_m}
          height={scene.depth_m}
          preserveAspectRatio="none"
          opacity="0.45"
          pointerEvents="none"
        />
      )}
      {reference && showReference && perception && (
        <g pointerEvents="none">
          {perception.wall_candidates.map((line, index) => (
            <line
              key={index}
              x1={(line[0][0] / perception.width_px) * scene.width_m}
              y1={(line[0][1] / perception.height_px) * scene.depth_m}
              x2={(line[1][0] / perception.width_px) * scene.width_m}
              y2={(line[1][1] / perception.height_px) * scene.depth_m}
              stroke="#dc9d64"
              strokeWidth="0.025"
              strokeDasharray="0.08 0.04"
            />
          ))}
        </g>
      )}
      {scene.walls.map((wall) => (
        <g
          key={wall.id}
          className="wall-shape"
          role="button"
          tabIndex={0}
          aria-label={`Select ${wall.id}`}
          onClick={() => onSelect(wall.id)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              onSelect(wall.id);
            }
          }}
        >
          <line
            x1={wall.start[0]}
            y1={wall.start[1]}
            x2={wall.end[0]}
            y2={wall.end[1]}
            stroke={selected === wall.id ? '#c5e9b4' : '#d5d6ca'}
            strokeWidth={wall.thickness}
            strokeLinecap="butt"
          />
          <line
            x1={wall.start[0]}
            y1={wall.start[1]}
            x2={wall.end[0]}
            y2={wall.end[1]}
            stroke="transparent"
            strokeWidth="0.32"
          />
        </g>
      ))}
      {scene.openings.map((opening) => {
        const wall = scene.walls.find((wall) => wall.id === opening.wall_id);
        if (!wall) return null;
        const {
          angle,
          position: [x, y],
          swing,
        } = openingPose(wall, opening, scene.rooms);
        return (
          <g
            key={opening.id}
            transform={`translate(${x} ${y}) rotate(${(angle * 180) / Math.PI})`}
            role="button"
            tabIndex={0}
            aria-label={`Select ${opening.type} ${opening.id}`}
            onClick={() => onSelect(opening.id)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                onSelect(opening.id);
              }
            }}
          >
            <path
              d={`M0 0 H${opening.width_m}`}
              stroke="#1b2420"
              strokeWidth={wall.thickness + 0.02}
            />
            {opening.type === 'door' ? (
              <>
                <path
                  d={`M0 0 V${swing * opening.width_m} M0 ${swing * opening.width_m} A${opening.width_m} ${opening.width_m} 0 0 ${swing > 0 ? 0 : 1} ${opening.width_m} 0`}
                  stroke="#b5c3b0"
                  strokeWidth="0.022"
                  fill="none"
                />
              </>
            ) : (
              <path
                d={`M0 ${-wall.thickness / 2}H${opening.width_m}V${wall.thickness / 2}H0Z M0 0H${opening.width_m} M${opening.width_m / 2} ${-wall.thickness / 2}V${wall.thickness / 2}`}
                stroke="#93c5c5"
                strokeWidth="0.025"
              />
            )}
          </g>
        );
      })}
      {showFurniture &&
        scene.furniture.map((stored) => {
          const item = draft?.id === stored.id ? draft : stored;
          const product = products.find(
            (product) => product.id === item.product_id,
          );
          if (!product) return null;
          return (
            <g
              key={item.id}
              transform={`translate(${item.position.join(' ')}) rotate(${item.rotation_deg})`}
              className="furniture-shape"
              role="button"
              tabIndex={0}
              aria-label={`Select ${product.name}`}
              onPointerDown={(event) => beginObject(event, item, product)}
              onClick={() => {
                if (tool !== 'measure' && tool !== 'pan') onSelect(item.id);
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  onSelect(item.id);
                }
              }}
            >
              <FurnitureSymbol product={product} />
              {selected === item.id && (
                <rect
                  x="-0.045"
                  y="-0.045"
                  width={product.width_m + 0.09}
                  height={product.depth_m + 0.09}
                  rx=".035"
                  className="furniture-selection"
                />
              )}
            </g>
          );
        })}
      <g className="room-annotations" pointerEvents="none">
        {scene.rooms.map((room) => {
          const [x, y] = centre(room.polygon);
          return (
            <g key={room.id}>
              <text
                x={x}
                y={y - 0.09}
                textAnchor="middle"
                className="room-name"
              >
                {room.name.toUpperCase()}
              </text>
              <text
                x={x}
                y={y + 0.18}
                textAnchor="middle"
                className="room-area"
              >
                {area(room.polygon).toFixed(1)} m²
              </text>
            </g>
          );
        })}
      </g>
      {measure.length > 0 && (
        <g className="measurement" pointerEvents="none">
          <circle cx={measure[0][0]} cy={measure[0][1]} r=".05" />
          {measure.length === 2 && (
            <>
              <line
                x1={measure[0][0]}
                y1={measure[0][1]}
                x2={measure[1][0]}
                y2={measure[1][1]}
              />
              <circle cx={measure[1][0]} cy={measure[1][1]} r=".05" />
              <text
                x={(measure[0][0] + measure[1][0]) / 2}
                y={(measure[0][1] + measure[1][1]) / 2 - 0.12}
              >
                {Math.hypot(
                  measure[0][0] - measure[1][0],
                  measure[0][1] - measure[1][1],
                ).toFixed(2)}{' '}
                m
              </text>
            </>
          )}
        </g>
      )}
      <g
        className="dimensions"
        fill="none"
        stroke="#6c7b70"
        strokeWidth="0.012"
      >
        <path
          d={`M0 -0.4 V-0.75 M${scene.width_m} -0.4 V-0.75 M0 -0.6 H${scene.width_m}`}
        />
        <path
          d={`M-0.4 0 H-0.75 M-0.4 ${scene.depth_m} H-0.75 M-0.6 0 V${scene.depth_m}`}
        />
      </g>
      <text
        className="dimension-label"
        x={scene.width_m / 2}
        y="-0.8"
        textAnchor="middle"
      >
        {scene.width_m.toFixed(2)} m
      </text>
      <text
        className="dimension-label"
        x="-0.82"
        y={scene.depth_m / 2}
        textAnchor="middle"
        transform={`rotate(-90 -0.82 ${scene.depth_m / 2})`}
      >
        {scene.depth_m.toFixed(2)} m
      </text>
    </svg>
  );
}
