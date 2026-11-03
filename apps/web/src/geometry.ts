import type { Furniture, Opening, Point, Product, Wall, Scene } from './types';

export function wallColor(
  scene: Scene,
  wall: Wall,
  products: Product[],
): string {
  const midpoint: Point = [
    (wall.start[0] + wall.end[0]) / 2,
    (wall.start[1] + wall.end[1]) / 2,
  ];
  for (const selection of scene.materials || []) {
    if (selection.surface !== 'walls') continue;
    const room = scene.rooms.find((room) => room.id === selection.room_id);
    const product = products.find(
      (product) => product.id === selection.product_id,
    );
    if (!room || !product) continue;
    const onBoundary = room.polygon.some((a, i) => {
      const b = room.polygon[(i + 1) % room.polygon.length];
      return (
        Math.abs(
          (midpoint[0] - a[0]) * (b[1] - a[1]) -
            (midpoint[1] - a[1]) * (b[0] - a[0]),
        ) < 0.001 &&
        midpoint[0] >= Math.min(a[0], b[0]) - 0.001 &&
        midpoint[0] <= Math.max(a[0], b[0]) + 0.001 &&
        midpoint[1] >= Math.min(a[1], b[1]) - 0.001 &&
        midpoint[1] <= Math.max(a[1], b[1]) + 0.001
      );
    });
    if (onBoundary) return product.color;
  }
  return '#dddace';
}

export function area(polygon: Point[]): number {
  return (
    Math.abs(
      polygon.reduce((sum, [x, y], i) => {
        const next = polygon[(i + 1) % polygon.length];
        return sum + x * next[1] - next[0] * y;
      }, 0),
    ) / 2
  );
}

export function centre(polygon: Point[]): Point {
  // Scene rooms are rectangular; bounds also give a stable label anchor during review.
  return [
    (Math.min(...polygon.map((p) => p[0])) +
      Math.max(...polygon.map((p) => p[0]))) /
      2,
    (Math.min(...polygon.map((p) => p[1])) +
      Math.max(...polygon.map((p) => p[1]))) /
      2,
  ];
}

export function furniturePolygon(item: Furniture, product: Product): Point[] {
  const angle = (item.rotation_deg * Math.PI) / 180;
  return [
    [0, 0],
    [product.width_m, 0],
    [product.width_m, product.depth_m],
    [0, product.depth_m],
  ].map(([x, y]) => [
    item.position[0] + x * Math.cos(angle) - y * Math.sin(angle),
    item.position[1] + x * Math.sin(angle) + y * Math.cos(angle),
  ]);
}

export interface WallPart {
  start: number;
  length: number;
  bottom: number;
  height: number;
}

// Both the top-down opening symbols and the 3D voids use the same wall offsets.
export function wallParts(wall: Wall, openings: Opening[]): WallPart[] {
  const length = Math.hypot(
    wall.end[0] - wall.start[0],
    wall.end[1] - wall.start[1],
  );
  const parts: WallPart[] = [];
  let cursor = 0;
  for (const opening of openings
    .filter((o) => o.wall_id === wall.id)
    .sort((a, b) => a.offset_m - b.offset_m)) {
    const start = Math.max(cursor, Math.min(length, opening.offset_m));
    const end = Math.min(length, opening.offset_m + opening.width_m);
    if (start > cursor)
      parts.push({
        start: cursor,
        length: start - cursor,
        bottom: 0,
        height: wall.height,
      });
    if (end > start) {
      if (opening.sill_m > 0)
        parts.push({
          start,
          length: end - start,
          bottom: 0,
          height: opening.sill_m,
        });
      const top = opening.sill_m + opening.height_m;
      if (top < wall.height)
        parts.push({
          start,
          length: end - start,
          bottom: top,
          height: wall.height - top,
        });
    }
    cursor = Math.max(cursor, end);
  }
  if (cursor < length)
    parts.push({
      start: cursor,
      length: length - cursor,
      bottom: 0,
      height: wall.height,
    });
  return parts;
}

export const money = (value: number) =>
  new Intl.NumberFormat('en-MA', { maximumFractionDigits: 0 }).format(value);
