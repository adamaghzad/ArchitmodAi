import { describe, expect, it, vi } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import {
  Box3,
  BoxGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Scene,
  DirectionalLight,
  PerspectiveCamera,
  WebGLRenderTarget,
  Texture,
  type WebGLRenderer,
} from 'three';
import catalogue from '../../../../data/catalogue.json';
import registry from '../../public/assets/registry.json';
import manifest from '../../public/assets/manifest.json';
import { parseRegistry } from './assetRegistry';
import { renderSnapshot } from './renderSnapshot';
import { metricUV, MaterialLibrary } from './materials';
import { cameraPose } from '../sceneGeometry';
import { mergeStaticModel } from './modelLoader';
import { modelInstance } from './modelLoader';
import type { Product } from '../types';
import { RenderResources } from './RenderResources';

it('owns palette material clones without mutating cached GLB materials or disposing shared maps', () => {
  const library = new MaterialLibrary();
  const source = new MeshStandardMaterial({ color: '#eeeeee', roughness: 0.8 });
  source.map = new Texture();
  const mapDisposed = vi.fn();
  source.map.addEventListener('dispose', mapDisposed);
  const tinted = library.tinted(source, '#9baa95');
  expect(tinted.color.getHexString()).toBe('9baa95');
  expect(source.color.getHexString()).toBe('eeeeee');
  expect(tinted.roughness).toBe(source.roughness);
  expect(tinted.map).toBe(source.map);
  expect(library.tinted(source, '#9baa95')).toBe(tinted);
  const disposed = vi.fn();
  tinted.addEventListener('dispose', disposed);
  const sourceDisposed = vi.fn();
  source.addEventListener('dispose', sourceDisposed);
  library.dispose();
  expect(disposed).toHaveBeenCalledOnce();
  expect(sourceDisposed).not.toHaveBeenCalled();
  expect(mapDisposed).not.toHaveBeenCalled();
});

describe('curated rendering assets', () => {
  it('maps only existing products to local models with verified attribution and intact files', () => {
    const parsed = parseRegistry(registry);
    expect(parsed.models).toHaveLength(registry.models.length);
    expect(parsed.materials).toHaveLength(3);
    expect(parsed.environment?.license).toBe('CC0-1.0');
    for (const model of parsed.models) {
      expect(catalogue.some((product) => product.id === model.productId)).toBe(
        true,
      );
      expect(
        manifest.assets.some(
          (asset) =>
            asset.source === model.source &&
            asset.author &&
            asset.license === model.license,
        ),
      ).toBe(true);
    }
    for (const asset of manifest.assets)
      for (const file of asset.files) {
        const path = new URL('../../public' + file.path, import.meta.url);
        expect(existsSync(path)).toBe(true);
        const contents = readFileSync(path);
        expect(contents.length).toBe(file.bytes);
        expect(createHash('sha256').update(contents).digest('hex')).toBe(
          file.sha256,
        );
        if (file.path.endsWith('.glb'))
          expect(contents.toString('ascii', 0, 4)).toBe('glTF');
      }
    expect(manifest.totalBytes).toBeLessThan(60 * 1024 * 1024);
  });
  it('rejects traversals and invalid texture scale while preserving the fallback registry', () => {
    const parsed = parseRegistry({
      models: [
        { ...registry.models[0], url: '/assets/models/../../private.glb' },
      ],
      materials: [{ ...registry.materials[0], tileMeters: 0 }],
      environment: {
        ...registry.environment,
        url: '/assets/environments/%2e%2e/private.hdr',
      },
    });
    expect(parsed.models).toEqual([]);
    expect(parsed.materials).toEqual([]);
    expect(parsed.environment).toBeUndefined();
  });
});

describe('shared renderer boundaries', () => {
  it('releases render-owned resources and restores renderer methods after a failed capture without disposing architecture', () => {
    const setRenderTarget = vi.fn(),
      render = vi.fn();
    const renderer = {
      setRenderTarget,
      render,
      getRenderTarget: () => null,
    } as unknown as WebGLRenderer;
    const resources = new RenderResources(renderer);
    const target = new WebGLRenderTarget(1, 1);
    const passMaterial = new MeshStandardMaterial(),
      sceneMaterial = new MeshStandardMaterial();
    const targetDispose = vi.fn(),
      passDispose = vi.fn(),
      sceneDispose = vi.fn();
    target.addEventListener('dispose', targetDispose);
    passMaterial.addEventListener('dispose', passDispose);
    sceneMaterial.addEventListener('dispose', sceneDispose);
    const scene = new Scene();
    scene.add(new Mesh(new BoxGeometry(), sceneMaterial));
    expect(() =>
      resources.capture(() => {
        renderer.setRenderTarget(target);
        renderer.render(
          new Mesh(new BoxGeometry(), passMaterial),
          new PerspectiveCamera(),
        );
        renderer.render(scene, new PerspectiveCamera());
        throw new Error('test capture failure');
      }),
    ).toThrow('test capture failure');
    expect(renderer.setRenderTarget).toBe(setRenderTarget);
    expect(renderer.render).toBe(render);
    resources.dispose();
    expect(targetDispose).toHaveBeenCalledOnce();
    expect(passDispose).toHaveBeenCalledOnce();
    expect(sceneDispose).not.toHaveBeenCalled();
  });
  it('uses a fallback when a tall imported model would visually underrepresent the stored footprint', () => {
    const source = new Group();
    source.add(
      new Mesh(new BoxGeometry(1.86, 1.27, 2.27), new MeshStandardMaterial()),
    );
    const product = catalogue.find(
      (item) => item.id === 'sample_bed',
    )! as Product;
    expect(modelInstance(source, product, 0.65)).toBeNull();
    expect(modelInstance(source, product)).not.toBeNull();
  });
  it('merges static components by material while preserving the metric transform', () => {
    const material = new MeshStandardMaterial();
    const source = new Group();
    source.position.set(2, 1, -3);
    for (let i = 0; i < 8; i++) {
      const part = new Mesh(new BoxGeometry(0.1, 0.3, 0.2), material);
      part.position.x = i * 0.1;
      source.add(part);
    }
    const before = new Box3().setFromObject(source);
    const merged = mergeStaticModel(source);
    expect(merged.children).toHaveLength(1);
    const after = new Box3().setFromObject(merged);
    after.min
      .toArray()
      .forEach((value, axis) =>
        expect(value).toBeCloseTo(before.min.toArray()[axis], 6),
      );
    after.max
      .toArray()
      .forEach((value, axis) =>
        expect(value).toBeCloseTo(before.max.toArray()[axis], 6),
      );
  });
  it('captures actual architecture with shared PBR resources and excludes render helpers', () => {
    const scene = new Scene();
    const model = new Group();
    model.name = 'architectural-model';
    model.position.x = -2.5;
    const mesh = new Mesh(new BoxGeometry(1, 1, 1), new MeshStandardMaterial());
    mesh.name = 'desk';
    model.add(mesh);
    const helper = new Mesh(new BoxGeometry(), new MeshBasicMaterial());
    helper.name = 'selection';
    model.add(helper);
    scene.add(model, new DirectionalLight());
    const snapshot = renderSnapshot(scene);
    const copied = snapshot.getObjectByName('desk') as Mesh;
    expect(copied.geometry).toBe(mesh.geometry);
    expect(copied.material).toBe(mesh.material);
    expect(snapshot.getObjectByName('selection')).toBeUndefined();
    expect(scene.getObjectByName('selection')).toBe(helper);
    expect(snapshot.getObjectByName('architectural-model')?.position.x).toBe(
      -2.5,
    );
    expect(snapshot.children).toHaveLength(2);
  });
  it('uses metre UVs rather than stretching each wall face and places the interior camera at eye level', () => {
    const geometry = new BoxGeometry(4, 2.8, 0.15);
    metricUV(geometry);
    const uv = geometry.getAttribute('uv');
    expect(
      Math.max(...Array.from({ length: uv.count }, (_, i) => uv.getX(i))),
    ).toBeCloseTo(2);
    const pose = cameraPose({ width_m: 5, depth_m: 4 }, 1.5, 'interior');
    expect(pose.position[1]).toBe(1.6);
    expect(Math.abs(pose.position[0])).toBeLessThan(2.5);
    expect(Math.abs(pose.position[2])).toBeLessThan(2);
  });
});
