import type { Product } from '../types';

export interface FurnitureAsset {
  id: string;
  productId?: string;
  category?: string;
  url: string;
  source: string;
  license: string;
  author?: string;
  licenseUrl?: string;
  minFootprintFill?: number;
}
export interface MaterialAsset {
  id: string;
  finish: 'floor' | 'wood' | 'plaster' | 'fabric' | 'ceramic';
  source: string;
  license: string;
  author: string;
  tileMeters: number;
  map: string;
  normalMap: string;
  roughnessMap: string;
}
export interface EnvironmentAsset {
  url: string;
  source: string;
  license: string;
  author: string;
}
export interface AssetRegistry {
  models: FurnitureAsset[];
  materials?: MaterialAsset[];
  environment?: EnvironmentAsset;
}
export const EMPTY_REGISTRY: AssetRegistry = { models: [] };

function localAsset(value: unknown, folder: string, extension: RegExp) {
  return (
    typeof value === 'string' &&
    value.startsWith(`/assets/${folder}/`) &&
    !/\.\.|%|\\|[?#]/.test(value) &&
    extension.test(value)
  );
}

export function parseRegistry(value: unknown): AssetRegistry {
  if (
    !value ||
    typeof value !== 'object' ||
    !('models' in value) ||
    !Array.isArray(value.models)
  )
    return EMPTY_REGISTRY;
  return {
    models: value.models.filter((entry): entry is FurnitureAsset =>
      Boolean(
        entry &&
        typeof entry === 'object' &&
        typeof entry.id === 'string' &&
        typeof entry.url === 'string' &&
        localAsset(entry.url, 'models', /\.(glb|gltf)$/i) &&
        typeof entry.source === 'string' &&
        typeof entry.license === 'string' &&
        entry.source.trim() &&
        entry.license.trim() &&
        (entry.minFootprintFill === undefined ||
          (Number.isFinite(entry.minFootprintFill) &&
            entry.minFootprintFill > 0 &&
            entry.minFootprintFill <= 1)) &&
        (typeof entry.productId === 'string' ||
          typeof entry.category === 'string'),
      ),
    ),
    materials: ('materials' in value && Array.isArray(value.materials)
      ? value.materials
      : []
    ).filter((entry): entry is MaterialAsset =>
      Boolean(
        entry &&
        typeof entry.id === 'string' &&
        ['floor', 'wood', 'plaster', 'fabric', 'ceramic'].includes(
          entry.finish,
        ) &&
        typeof entry.author === 'string' &&
        entry.author.trim() &&
        typeof entry.source === 'string' &&
        entry.source.trim() &&
        typeof entry.license === 'string' &&
        entry.license.trim() &&
        Number.isFinite(entry.tileMeters) &&
        entry.tileMeters > 0 &&
        ['map', 'normalMap', 'roughnessMap'].every((key) =>
          localAsset(entry[key], 'textures', /\.(jpg|png|webp)$/i),
        ),
      ),
    ),
    environment:
      'environment' in value &&
      value.environment &&
      typeof value.environment === 'object' &&
      'url' in value.environment &&
      localAsset(value.environment.url, 'environments', /\.(hdr|exr)$/i) &&
      'source' in value.environment &&
      typeof value.environment.source === 'string' &&
      value.environment.source.trim() &&
      'license' in value.environment &&
      typeof value.environment.license === 'string' &&
      value.environment.license.trim() &&
      'author' in value.environment &&
      typeof value.environment.author === 'string'
        ? (value.environment as EnvironmentAsset)
        : undefined,
  };
}

export function resolveAsset(product: Product, registry: AssetRegistry) {
  return (
    registry.models.find((asset) => asset.productId === product.id) ||
    registry.models.find((asset) => asset.category === product.category)
  );
}

export function uniformFit(
  modelSize: [number, number, number],
  product: Product,
) {
  if (modelSize.some((value) => !Number.isFinite(value) || value <= 0))
    throw new Error('Model has empty or invalid bounds');
  return Math.min(
    product.width_m / modelSize[0],
    product.height_m / modelSize[1],
    product.depth_m / modelSize[2],
  );
}
