import { describe, expect, it } from 'vitest';
import { area, centre, furniturePolygon, wallParts } from './geometry';
import type { Opening, Product, Wall } from './types';

describe('scene geometry', () => {
  it('uses polygon area regardless of winding direction', () => {
    expect(
      area([
        [0, 0],
        [5, 0],
        [5, 4],
        [0, 4],
      ]),
    ).toBe(20);
    expect(
      area([
        [0, 4],
        [5, 4],
        [5, 0],
        [0, 0],
      ]),
    ).toBe(20);
    expect(
      centre([
        [2, 1],
        [6, 1],
        [6, 3],
        [2, 3],
      ]),
    ).toEqual([4, 2]);
  });
  it('rotates furniture around the same origin as the backend', () => {
    const polygon = furniturePolygon(
      {
        id: 'item',
        product_id: 'p',
        room_id: 'r',
        position: [4, 2],
        rotation_deg: 90,
      },
      { width_m: 2, depth_m: 1 } as Product,
    );
    expect(polygon[0]).toEqual([4, 2]);
    expect(polygon[2][0]).toBeCloseTo(3);
    expect(polygon[2][1]).toBeCloseTo(4);
  });
  it('leaves a true door void while retaining the header', () => {
    const wall: Wall = {
      id: 'wall',
      start: [0, 0],
      end: [5, 0],
      height: 2.8,
      thickness: 0.2,
    };
    const door: Opening = {
      id: 'door',
      wall_id: 'wall',
      type: 'door',
      offset_m: 1,
      width_m: 0.9,
      height_m: 2.1,
      sill_m: 0,
    };
    const parts = wallParts(wall, [door]);
    expect(parts).toHaveLength(3);
    expect(parts[0]).toEqual({ start: 0, length: 1, bottom: 0, height: 2.8 });
    expect(parts[1].bottom).toBe(2.1);
    expect(parts[1].height).toBeCloseTo(0.7);
    expect(parts[2].start).toBe(1.9);
  });
  it('retains a sill and a header around a window', () => {
    const wall: Wall = {
      id: 'wall',
      start: [0, 0],
      end: [5, 0],
      height: 2.8,
      thickness: 0.2,
    };
    const window: Opening = {
      id: 'window',
      wall_id: 'wall',
      type: 'window',
      offset_m: 1,
      width_m: 1.2,
      height_m: 1.2,
      sill_m: 0.9,
    };
    expect(wallParts(wall, [window])).toHaveLength(4);
    expect(wallParts(wall, [window])[1].height).toBe(0.9);
  });
});
