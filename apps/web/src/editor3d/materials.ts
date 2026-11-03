import { createContext, useContext } from 'react';
import {
  CanvasTexture,
  MeshStandardMaterial,
  MeshPhysicalMaterial,
  RepeatWrapping,
  SRGBColorSpace,
  DoubleSide,
  NoColorSpace,
  Color,
} from 'three';

export type Finish =
  | 'wood'
  | 'fabric'
  | 'ceramic'
  | 'tile'
  | 'stone'
  | 'plaster'
  | 'metal'
  | 'glass'
  | 'light'
  | 'dark';

function texture(kind: Finish): CanvasTexture | null {
  if (['glass', 'metal', 'light', 'dark'].includes(kind)) return null;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 256;
  const context = canvas.getContext('2d')!;
  let seed = 37;
  const random = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  context.fillStyle = '#ddddda';
  context.fillRect(0, 0, 256, 256);
  if (kind === 'wood') {
    for (let plank = 0; plank < 4; plank++) {
      const shade = 190 + Math.floor(random() * 45);
      context.fillStyle = `rgb(${shade},${shade - 4},${shade - 10})`;
      context.fillRect(plank * 64, 0, 64, 256);
      for (let grain = 0; grain < 65; grain++) {
        const x = plank * 64 + random() * 64;
        context.strokeStyle = `rgba(65,49,24,${0.025 + random() * 0.07})`;
        context.lineWidth = 0.3 + random() * 0.8;
        context.beginPath();
        context.moveTo(x, 0);
        context.bezierCurveTo(x - 4, 80, x + 4, 180, x + random() * 3, 256);
        context.stroke();
      }
      context.fillStyle = 'rgba(45,38,24,.2)';
      context.fillRect(plank * 64, 0, 1, 256);
      const end = plank % 2 ? 70 : 195;
      context.fillRect(plank * 64, end, 64, 1);
    }
  } else if (kind === 'fabric') {
    context.fillStyle = '#d9d9d3';
    context.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 256; i += 3) {
      context.fillStyle = i % 2 ? '#b7b8b0' : '#eeeeea';
      context.fillRect(i, 0, 1, 256);
      context.fillStyle = 'rgba(45,48,34,.14)';
      context.fillRect(0, i, 256, 1);
    }
  } else if (kind === 'tile') {
    context.fillStyle = '#d7d8d1';
    context.fillRect(0, 0, 256, 256);
    context.strokeStyle = '#858a7b';
    context.lineWidth = 2;
    context.strokeRect(0, 0, 256, 256);
  } else if (kind === 'stone') {
    for (let i = 0; i < 900; i++) {
      const shade = 150 + Math.floor(random() * 95);
      context.fillStyle = `rgba(${shade},${shade},${shade},.25)`;
      context.fillRect(
        random() * 256,
        random() * 256,
        1 + random() * 4,
        1 + random() * 2,
      );
    }
  } else {
    for (let i = 0; i < 6000; i++) {
      context.fillStyle = `rgba(85,85,78,${random() * 0.08})`;
      context.fillRect(random() * 256, random() * 256, 1, 1);
    }
  }
  const map = new CanvasTexture(canvas);
  map.wrapS = map.wrapT = RepeatWrapping;
  map.colorSpace = SRGBColorSpace;
  map.anisotropy = 4;
  if (kind === 'tile') map.repeat.set(1 / 0.6, 1 / 0.6);
  return map;
}

export class MaterialLibrary {
  private textures = new Map<Finish, CanvasTexture | null>();
  private materials = new Map<string, MeshStandardMaterial>();
  private bumps = new Map<Finish, CanvasTexture>();
  get(kind: Finish, color: string) {
    const key = `${kind}:${color}`;
    const existing = this.materials.get(key);
    if (existing) return existing;
    if (!this.textures.has(kind)) this.textures.set(kind, texture(kind));
    const map = this.textures.get(kind) || null;
    if (map && !this.bumps.has(kind)) {
      const bump = map.clone();
      bump.colorSpace = NoColorSpace;
      bump.needsUpdate = true;
      this.bumps.set(kind, bump);
    }
    const material =
      kind === 'glass'
        ? new MeshPhysicalMaterial({
            color,
            roughness: 0.07,
            metalness: 0,
            transparent: true,
            opacity: 0.23,
            depthWrite: false,
            side: DoubleSide,
          })
        : new MeshStandardMaterial({
            color,
            map,
            roughness:
              kind === 'metal'
                ? 0.28
                : kind === 'ceramic'
                  ? 0.32
                  : kind === 'stone'
                    ? 0.42
                    : kind === 'wood'
                      ? 0.68
                      : 0.92,
            metalness: kind === 'metal' ? 0.78 : 0,
            bumpMap: this.bumps.get(kind) || null,
            bumpScale:
              kind === 'fabric' ? 0.001 : kind === 'wood' ? 0.002 : 0.0008,
            side: DoubleSide,
          });
    if (kind === 'light') {
      material.emissive = new Color('#ffe0a0');
      material.emissiveIntensity = 0.8;
      material.toneMapped = false;
    }
    this.materials.set(key, material);
    return material;
  }
  dispose() {
    this.materials.forEach((material) => material.dispose());
    this.textures.forEach((map) => map?.dispose());
    this.bumps.forEach((map) => map.dispose());
  }
}

export const MaterialContext = createContext<MaterialLibrary | null>(null);
export function useMaterials() {
  const library = useContext(MaterialContext);
  if (!library) throw new Error('MaterialProvider is required');
  return library;
}

export function finishFor(material: string): Finish {
  const text = material.toLowerCase();
  if (/paint|plaster/.test(text)) return 'plaster';
  if (/tile|ceramic|porcelain/.test(text)) return 'ceramic';
  if (/stone|marble/.test(text)) return 'stone';
  if (/linen|fabric|cotton|wool|mesh/.test(text)) return 'fabric';
  if (/glass/.test(text)) return 'glass';
  if (/metal/.test(text)) return 'metal';
  return 'wood';
}
