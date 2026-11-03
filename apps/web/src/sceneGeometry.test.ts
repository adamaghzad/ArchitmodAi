import { describe, expect, it } from 'vitest';
import { Box3, BoxGeometry, Group, Mesh, Vector3 } from 'three';
import catalogue from '../../../data/catalogue.json';
import { cameraPose, openingPose, rotateAtCentre } from './sceneGeometry';
import { centre, furniturePolygon } from './geometry';
import { furnitureParts } from './editor3d/furnitureParts';
import { parseRegistry, uniformFit } from './editor3d/assetRegistry';
import { modelInstance } from './editor3d/modelLoader';
import type { Product, Room, Wall, Opening, Furniture } from './types';

const products = catalogue as Product[];
describe('shared dimensional rendering', () => {
  it('keeps every procedural part inside the actual catalogue bounds', () => {
    for (const product of products.filter(
      (product) => product.kind === 'furniture',
    )) {
      const parts = furnitureParts(product);
      expect(parts.length).toBeGreaterThan(0);
      for (const part of parts)
        for (const axis of [0, 1, 2] as const) {
          const lower =
            axis === 1
              ? 0
              : -(axis === 0 ? product.width_m : product.depth_m) / 2;
          const upper =
            axis === 1
              ? product.height_m
              : (axis === 0 ? product.width_m : product.depth_m) / 2;
          expect(
            part.position[axis] - part.size[axis] / 2,
            `${product.id} minimum axis ${axis}`,
          ).toBeGreaterThanOrEqual(lower - 1e-8);
          expect(
            part.position[axis] + part.size[axis] / 2,
            `${product.id} maximum axis ${axis}`,
          ).toBeLessThanOrEqual(upper + 1e-8);
        }
    }
  });
  it('rotates around the visible centre while retaining the backend origin convention', () => {
    const product = products.find((product) => product.id === 'sample_sofa')!;
    let item: Furniture = {
      id: 'sofa',
      product_id: product.id,
      room_id: 'room',
      position: [2, 3],
      rotation_deg: 0,
    };
    const original = centre(furniturePolygon(item, product));
    for (let i = 0; i < 4; i++) {
      item = rotateAtCentre(item, product);
      expect(centre(furniturePolygon(item, product))).toEqual(original);
    }
    expect(item.position[0]).toBeCloseTo(2);
    expect(item.position[1]).toBeCloseTo(3);
  });
  it('uses the same inward door swing convention on opposite exterior walls', () => {
    const room = {
      polygon: [
        [0, 0],
        [5, 0],
        [5, 4],
        [0, 4],
      ],
    } as Room;
    const opening = { offset_m: 1, width_m: 0.9 } as Opening;
    const top = { start: [0, 0], end: [5, 0] } as Wall,
      bottom = { start: [0, 4], end: [5, 4] } as Wall;
    expect(openingPose(top, opening, [room])).toMatchObject({
      position: [1, 0],
      swing: 1,
    });
    expect(openingPose(bottom, opening, [room])).toMatchObject({
      position: [1, 4],
      swing: -1,
    });
  });
  it('fits narrow viewports and keeps all presets above the floor', () => {
    const scene = { width_m: 8, depth_m: 6 };
    expect(Math.hypot(...cameraPose(scene, 0.5).position)).toBeGreaterThan(
      Math.hypot(...cameraPose(scene, 1.5).position),
    );
    for (const preset of ['top', 'isometric', 'perspective'] as const)
      expect(cameraPose(scene, 1, preset).position[1]).toBeGreaterThan(1);
  });
});
describe('optional asset safety and fitting', () => {
  it('accepts registered local licensed assets and rejects unregistered network paths', () => {
    expect(
      parseRegistry({
        models: [
          {
            id: 'chair',
            category: 'chair',
            url: '/assets/models/chair.glb',
            source: 'Project author',
            license: 'Owned',
          },
        ],
      }).models,
    ).toHaveLength(1);
    expect(
      parseRegistry({
        models: [
          {
            id: 'external',
            category: 'chair',
            url: 'https://example.com/large.glb',
            source: 'unknown',
            license: '',
          },
        ],
      }).models,
    ).toEqual([]);
    expect(parseRegistry(null).models).toEqual([]);
  });
  it('clones and uniformly fits a translated model without changing the cached source', () => {
    const source = new Group();
    source.position.set(4, 2, -3);
    source.scale.setScalar(2);
    source.add(new Mesh(new BoxGeometry(1, 2, 1)));
    const product = products.find((product) => product.id === 'sample_sofa')!;
    const instance = modelInstance(source, product)!;
    const bounds = new Box3().setFromObject(instance),
      size = bounds.getSize(new Vector3()),
      center = bounds.getCenter(new Vector3());
    expect(bounds.min.y).toBeCloseTo(0);
    expect(center.x).toBeCloseTo(0);
    expect(center.z).toBeCloseTo(0);
    expect(size.x).toBeLessThanOrEqual(product.width_m);
    expect(size.y).toBeLessThanOrEqual(product.height_m);
    expect(size.z).toBeLessThanOrEqual(product.depth_m);
    expect(size.y / size.x).toBeCloseTo(2);
    expect(source.position.toArray()).toEqual([4, 2, -3]);
    expect(() => uniformFit([0, 1, 1], product)).toThrow();
  });
});
