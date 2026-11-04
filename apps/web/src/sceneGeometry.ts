import { centre, furniturePolygon } from './geometry';
import type {
  Furniture,
  Opening,
  Point,
  Product,
  Room,
  Scene,
  Wall,
} from './types';
import type { CameraPreset } from './editorTypes';

export const perimeter = (polygon: Point[]) =>
  polygon.reduce((sum, point, index) => {
    const next = polygon[(index + 1) % polygon.length];
    return sum + Math.hypot(next[0] - point[0], next[1] - point[1]);
  }, 0);

export function wallAtRoom(wall: Wall, room: Room): boolean {
  return room.polygon.some((a, i) => {
    const b = room.polygon[(i + 1) % room.polygon.length];
    return [wall.start, wall.end].every(
      (point) =>
        Math.abs(
          (point[0] - a[0]) * (b[1] - a[1]) - (point[1] - a[1]) * (b[0] - a[0]),
        ) < 0.001 &&
        point[0] >= Math.min(a[0], b[0]) - 0.001 &&
        point[0] <= Math.max(a[0], b[0]) + 0.001 &&
        point[1] >= Math.min(a[1], b[1]) - 0.001 &&
        point[1] <= Math.max(a[1], b[1]) + 0.001,
    );
  });
}

export function pointInRoom(point: Point, room: Room): boolean {
  let inside = false;
  for (
    let i = 0, j = room.polygon.length - 1;
    i < room.polygon.length;
    j = i++
  ) {
    const a = room.polygon[i],
      b = room.polygon[j];
    if (
      a[1] > point[1] !== b[1] > point[1] &&
      point[0] < ((b[0] - a[0]) * (point[1] - a[1])) / (b[1] - a[1]) + a[0]
    )
      inside = !inside;
  }
  return inside;
}

export function openingPose(wall: Wall, opening: Opening, rooms: Room[]) {
  const angle = Math.atan2(
    wall.end[1] - wall.start[1],
    wall.end[0] - wall.start[0],
  );
  const position: Point = [
    wall.start[0] + Math.cos(angle) * opening.offset_m,
    wall.start[1] + Math.sin(angle) * opening.offset_m,
  ];
  const inward: Point = [
    position[0] +
      (Math.cos(angle) * opening.width_m) / 2 -
      Math.sin(angle) * 0.25,
    position[1] +
      (Math.sin(angle) * opening.width_m) / 2 +
      Math.cos(angle) * 0.25,
  ];
  return {
    angle,
    position,
    swing: rooms.some((room) => pointInRoom(inward, room)) ? 1 : -1,
  };
}

export function rotateAtCentre(item: Furniture, product: Product): Furniture {
  const anchor = centre(furniturePolygon(item, product));
  const rotation = ((item.rotation_deg + 90) %
    360) as Furniture['rotation_deg'];
  const rotated = furniturePolygon(
    { ...item, position: [0, 0], rotation_deg: rotation },
    product,
  );
  const offset = centre(rotated);
  return {
    ...item,
    rotation_deg: rotation,
    position: [anchor[0] - offset[0], anchor[1] - offset[1]],
  };
}

export function roomSurface(
  scene: Scene,
  roomId: string,
  products: Product[],
  surface: 'floor' | 'walls',
) {
  const selection = scene.materials.find(
    (item) => item.room_id === roomId && item.surface === surface,
  );
  return products.find((product) => product.id === selection?.product_id);
}

export function cameraPose(
  scene: Pick<Scene, 'width_m' | 'depth_m'> & { height_m?: number },
  aspect: number,
  preset: CameraPreset = 'isometric',
) {
  const height = scene.height_m || 2.8;
  if (preset === 'interior')
    return {
      position: [scene.width_m * 0.42, 1.6, scene.depth_m * 0.4] as [
        number,
        number,
        number,
      ],
      target: [-scene.width_m * 0.04, 1.1, -scene.depth_m * 0.1] as [
        number,
        number,
        number,
      ],
    };
  const target: [number, number, number] = [0, height * 0.3, 0];
  const vector =
    preset === 'top'
      ? [0, 1, 0.001]
      : preset === 'perspective'
        ? [0.65, 0.48, 1]
        : [0.7, 1, 1];
  const norm = Math.hypot(...vector),
    [dx, dy, dz] = vector.map((value) => value / norm);
  const horizontal = Math.hypot(dx, dz);
  const right = [dz / horizontal, 0, -dx / horizontal];
  const up = [(-dy * dx) / horizontal, horizontal, (-dy * dz) / horizontal];
  const vertical = Math.tan((38 * Math.PI) / 360),
    horizontalFov = vertical * Math.max(0.1, aspect);
  let distance = 2;
  // Fit the projected metric box, not a sphere that leaves large unused margins.
  for (const x of [-scene.width_m / 2 - 0.15, scene.width_m / 2 + 0.15])
    for (const y of [-0.25, height + 0.1])
      for (const z of [-scene.depth_m / 2 - 0.15, scene.depth_m / 2 + 0.15]) {
        const relative = [x, y - target[1], z];
        const along = relative[0] * dx + relative[1] * dy + relative[2] * dz;
        const projectedX = relative.reduce(
          (sum, value, index) => sum + value * right[index],
          0,
        );
        const projectedY = relative.reduce(
          (sum, value, index) => sum + value * up[index],
          0,
        );
        distance = Math.max(
          distance,
          along +
            Math.max(
              Math.abs(projectedX) / horizontalFov,
              Math.abs(projectedY) / vertical,
            ),
        );
      }
  distance *= 1.12;
  return {
    position: [dx * distance, target[1] + dy * distance, dz * distance] as [
      number,
      number,
      number,
    ],
    target,
  };
}
