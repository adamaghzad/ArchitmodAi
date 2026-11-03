import { memo, useMemo } from 'react';
import { Shape } from 'three';
import { area, wallParts, wallColor } from '../geometry';
import { openingPose, roomSurface } from '../sceneGeometry';
import { useMaterials, finishFor } from './materials';
import type { Finish } from './materials';
import type { Product, Room, Scene, Wall, Opening } from '../types';
import type { ViewSettings } from '../editorTypes';

const shapes = new Map<string, Shape>();
function roomShape(room: Room) {
  const key = room.polygon.flat().join(',');
  if (!shapes.has(key)) {
    const shape = new Shape();
    room.polygon.forEach(([x, y], i) =>
      i === 0 ? shape.moveTo(x, -y) : shape.lineTo(x, -y),
    );
    shape.closePath();
    shapes.set(key, shape);
    if (shapes.size > 128) shapes.delete(shapes.keys().next().value!);
  }
  return shapes.get(key)!;
}

const RoomFloor = memo(function RoomFloor({
  room,
  color,
  finish,
  selected,
  ceilings,
  height,
  onSelect,
}: {
  room: Room;
  color: string;
  finish: Finish;
  selected: boolean;
  ceilings: boolean;
  height: number;
  onSelect: (id: string) => void;
}) {
  const library = useMaterials();
  const shape = roomShape(room);
  if (area(room.polygon) === 0) return null;
  return (
    <group>
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, 0.012, 0]}
        receiveShadow
        onClick={(event) => {
          event.stopPropagation();
          onSelect(room.id);
        }}
        name={`room:${room.id}`}
      >
        <shapeGeometry args={[shape]} />
        <primitive attach="material" object={library.get(finish, color)} />
      </mesh>
      {selected && (
        <mesh
          rotation={[-Math.PI / 2, 0, 0]}
          position={[0, 0.018, 0]}
          onClick={(event) => {
            event.stopPropagation();
            onSelect(room.id);
          }}
        >
          <shapeGeometry args={[shape]} />
          <meshBasicMaterial
            color="#c2e5a9"
            transparent
            opacity={0.07}
            depthWrite={false}
          />
        </mesh>
      )}
      {ceilings && (
        <mesh
          rotation={[-Math.PI / 2, 0, 0]}
          position={[0, height, 0]}
          castShadow
        >
          <shapeGeometry args={[shape]} />
          <primitive
            attach="material"
            object={library.get('plaster', '#edece3')}
          />
        </mesh>
      )}
    </group>
  );
});

const WallMesh = memo(function WallMesh({
  wall,
  openings,
  color,
  selected,
  cutaway,
  width,
  depth,
  onSelect,
}: {
  wall: Wall;
  openings: Opening[];
  color: string;
  selected: boolean;
  cutaway: boolean;
  width: number;
  depth: number;
  onSelect: (id: string) => void;
}) {
  const library = useMaterials();
  const parts = useMemo(() => wallParts(wall, openings), [wall, openings]);
  const angle = Math.atan2(
    wall.end[1] - wall.start[1],
    wall.end[0] - wall.start[0],
  );
  const nearEdge =
    (Math.abs(wall.start[0] - width) < 0.01 &&
      Math.abs(wall.end[0] - width) < 0.01) ||
    (Math.abs(wall.start[1] - depth) < 0.01 &&
      Math.abs(wall.end[1] - depth) < 0.01);
  const cap = cutaway && nearEdge ? 0.65 : wall.height;
  return (
    <group
      position={[wall.start[0], 0, wall.start[1]]}
      rotation={[0, -angle, 0]}
      name={`wall:${wall.id}`}
    >
      {parts.map((part, i) => {
        const h = Math.min(part.height, cap - part.bottom);
        if (h <= 0) return null;
        return (
          <group key={i}>
            <mesh
              position={[part.start + part.length / 2, part.bottom + h / 2, 0]}
              castShadow
              receiveShadow
              onClick={(event) => {
                event.stopPropagation();
                onSelect(wall.id);
              }}
            >
              <boxGeometry args={[part.length, h, wall.thickness]} />
              <primitive
                attach="material"
                object={library.get('plaster', selected ? '#c8d5b1' : color)}
              />
            </mesh>
            {part.bottom === 0 &&
              [-1, 1].map((side) => (
                <mesh
                  key={side}
                  position={[
                    part.start + part.length / 2,
                    0.045,
                    side * (wall.thickness / 2 + 0.008),
                  ]}
                  receiveShadow
                >
                  <boxGeometry args={[part.length, 0.09, 0.016]} />
                  <primitive
                    attach="material"
                    object={library.get('wood', '#e3dfd2')}
                  />
                </mesh>
              ))}
          </group>
        );
      })}
    </group>
  );
});

function ArchitecturalOpening({
  scene,
  wall,
  opening,
  selected,
  onSelect,
}: {
  scene: Scene;
  wall: Wall;
  opening: Opening;
  selected: boolean;
  onSelect: (id: string) => void;
}) {
  const library = useMaterials();
  const { angle, position, swing } = openingPose(wall, opening, scene.rooms);
  const w = opening.width_m,
    h = opening.height_m,
    sill = opening.sill_m,
    frame = 0.045;
  const metal = library.get('metal', selected ? '#a7c989' : '#677465');
  return (
    <group
      position={[position[0], sill, position[1]]}
      rotation={[0, -angle, 0]}
      name={`opening:${opening.id}`}
      onClick={(event) => {
        event.stopPropagation();
        onSelect(opening.id);
      }}
    >
      {[0, w].map((x) => (
        <mesh
          key={x}
          position={[x, h / 2, 0]}
          material={
            opening.type === 'window' ? metal : library.get('wood', '#e4decc')
          }
          castShadow
        >
          <boxGeometry args={[frame, h, wall.thickness + 0.035]} />
        </mesh>
      ))}
      <mesh
        position={[w / 2, h, 0]}
        material={
          opening.type === 'window' ? metal : library.get('wood', '#e4decc')
        }
        castShadow
      >
        <boxGeometry args={[w + frame, frame, wall.thickness + 0.035]} />
      </mesh>
      {opening.type === 'window' ? (
        <>
          <mesh position={[w / 2, 0, 0]} material={metal}>
            <boxGeometry args={[w + frame, frame, wall.thickness + 0.07]} />
          </mesh>
          <mesh position={[w / 2, h / 2, 0]} material={metal}>
            <boxGeometry args={[0.025, h, 0.055]} />
          </mesh>
          <mesh
            position={[w / 2, h / 2, 0]}
            material={library.get('glass', '#d7e3d8')}
          >
            <boxGeometry args={[w - frame, h - frame, 0.012]} />
          </mesh>
        </>
      ) : (
        <group rotation={[0, -swing * Math.PI * 0.32, 0]}>
          <mesh
            position={[w / 2, h / 2, 0]}
            castShadow
            material={library.get('wood', selected ? '#b5c596' : '#ad8d61')}
          >
            <boxGeometry args={[w - frame, h - frame, 0.038]} />
          </mesh>
          <mesh
            position={[w - 0.1, h * 0.49, 0.04]}
            material={library.get('metal', '#9c8e64')}
          >
            <boxGeometry args={[0.1, 0.016, 0.025]} />
          </mesh>
        </group>
      )}
    </group>
  );
}

export default function Architecture({
  scene,
  products,
  selected,
  onSelect,
  settings,
}: {
  scene: Scene;
  products: Product[];
  selected: string | null;
  onSelect: (id: string) => void;
  settings: ViewSettings;
}) {
  const library = useMaterials();
  const height = Math.max(2.8, ...scene.walls.map((wall) => wall.height));
  return (
    <group>
      <mesh
        position={[scene.width_m / 2, -0.12, scene.depth_m / 2]}
        receiveShadow
        castShadow
      >
        <boxGeometry
          args={[scene.width_m + 0.16, 0.24, scene.depth_m + 0.16]}
        />
        <primitive
          attach="material"
          object={library.get('plaster', '#d4d2c5')}
        />
      </mesh>
      {scene.rooms.map((room) => {
        const material = roomSurface(scene, room.id, products, 'floor');
        const tile = room.type === 'bathroom' || room.type === 'kitchen';
        const finish: Finish = material
          ? material.category === 'flooring' &&
            /tile|ceramic|porcelain/.test(material.material)
            ? 'tile'
            : finishFor(material.material)
          : tile
            ? 'tile'
            : 'wood';
        return (
          <RoomFloor
            key={room.id}
            room={room}
            selected={selected === room.id}
            color={
              material?.color ||
              (room.provenance === 'user_corrected'
                ? room.color
                : tile
                  ? '#b8b8ab'
                  : '#c6ad86')
            }
            finish={finish}
            ceilings={settings.ceilings}
            height={height}
            onSelect={onSelect}
          />
        );
      })}
      {scene.walls.map((wall) => (
        <WallMesh
          key={wall.id}
          wall={wall}
          openings={scene.openings}
          color={wallColor(scene, wall, products)}
          selected={selected === wall.id}
          cutaway={settings.cutaway}
          width={scene.width_m}
          depth={scene.depth_m}
          onSelect={onSelect}
        />
      ))}
      {scene.openings.map((opening) => {
        const wall = scene.walls.find((wall) => wall.id === opening.wall_id);
        return wall ? (
          <ArchitecturalOpening
            key={opening.id}
            scene={scene}
            wall={wall}
            opening={opening}
            selected={selected === opening.id}
            onSelect={onSelect}
          />
        ) : null;
      })}
    </group>
  );
}
