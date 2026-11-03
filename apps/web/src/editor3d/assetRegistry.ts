import type { Product } from '../types';

export interface FurnitureAsset {
  id: string;
  productId?: string;
  category?: string;
  url: string;
  source: string;
  license: string;
}
export interface AssetRegistry {
  models: FurnitureAsset[];
}
export const EMPTY_REGISTRY: AssetRegistry = { models: [] };

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
        entry.url.startsWith('/assets/models/') &&
        /\.(glb|gltf)$/i.test(entry.url) &&
        typeof entry.source === 'string' &&
        typeof entry.license === 'string' &&
        entry.source.trim() &&
        entry.license.trim() &&
        (typeof entry.productId === 'string' ||
          typeof entry.category === 'string'),
      ),
    ),
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
