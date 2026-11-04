import type { Product } from '../types';
import type { Finish } from './materials';

export interface FurniturePart {
  shape: 'box' | 'round' | 'cylinder' | 'sphere';
  size: [number, number, number];
  position: [number, number, number];
  finish: Finish;
  color: string;
}

// Every component is specified in product units, with its feet at y=0 and its
// footprint centered at x=z=0. Round parts use world-unit radii, not stretched GLBs.
export function furnitureParts(product: Product): FurniturePart[] {
  const w = product.width_m,
    h = product.height_m,
    d = product.depth_m;
  const parts: FurniturePart[] = [];
  const add = (
    shape: FurniturePart['shape'],
    x: number,
    y: number,
    z: number,
    a: number,
    b: number,
    c: number,
    finish: Finish = 'wood',
    color = product.color,
  ) =>
    parts.push({
      shape,
      position: [x * w, y * h, z * d],
      size: [a * w, b * h, c * d],
      finish,
      color,
    });
  const box = (
    x: number,
    y: number,
    z: number,
    a: number,
    b: number,
    c: number,
    finish: Finish = 'wood',
    color = product.color,
  ) => add('round', x, y, z, a, b, c, finish, color);
  const leg = (
    x: number,
    z: number,
    top = 0.85,
    bottom = 0.03,
    finish: Finish = 'wood',
  ) => {
    const r = Math.min(0.025, w * 0.035, d * 0.055);
    parts.push({
      shape: 'cylinder',
      position: [x * w, ((top + bottom) / 2) * h, z * d],
      size: [r * 2, (top - bottom) * h, r * 2],
      finish,
      color: finish === 'metal' ? '#51564f' : '#856341',
    });
  };
  const legs = (top = 0.85) => {
    for (const x of [-0.36, 0.36])
      for (const z of [-0.34, 0.34]) leg(x, z, top, 0);
  };
  const category = product.category;
  if (category === 'sofa') {
    legs(0.23);
    box(0, 0.28, 0, 0.95, 0.22, 0.94, 'fabric');
    box(0, 0.67, -0.4, 0.94, 0.66, 0.18, 'fabric');
    box(-0.44, 0.56, 0, 0.12, 0.66, 0.98, 'fabric');
    box(0.44, 0.56, 0, 0.12, 0.66, 0.98, 'fabric');
    const count = w > 1.9 ? 3 : 2;
    for (let i = 0; i < count; i++) {
      const x = -0.37 + ((i + 0.5) * 0.74) / count;
      box(x, 0.49, 0.075, 0.74 / count - 0.015, 0.18, 0.72, 'fabric');
      box(x, 0.77, -0.24, 0.74 / count - 0.025, 0.33, 0.14, 'fabric');
    }
    box(-0.31, 0.67, 0.08, 0.14, 0.2, 0.2, 'fabric', '#c5c3ac');
  } else if (category === 'bed' && h >= 0.9) {
    legs(0.15);
    box(0, 0.22, 0.015, 0.98, 0.2, 0.96, 'fabric');
    box(0, 0.39, 0.015, 0.95, 0.16, 0.93, 'fabric', '#f3eee3');
    box(0, 0.53, -0.465, 1, 0.94, 0.07, 'fabric');
    for (const x of [-0.37, -0.12, 0.12, 0.37])
      box(x, 0.65, -0.42, 0.23, 0.68, 0.035, 'fabric');
    box(0, 0.495, 0.16, 0.96, 0.1, 0.62, 'fabric');
    for (const x of [-0.235, 0.235]) {
      box(x, 0.53, -0.29, 0.41, 0.13, 0.21, 'fabric', '#f7f0e5');
      box(x, 0.59, -0.19, 0.24, 0.12, 0.09, 'fabric', '#9baa95');
    }
    box(0, 0.555, 0.35, 0.965, 0.035, 0.17, 'fabric', '#9baa95');
    for (let i = 0; i < 9; i++)
      box(
        -0.43 + i * 0.1075,
        0.575,
        0.35,
        0.012,
        0.008,
        0.16,
        'fabric',
        '#a9b9a3',
      );
  } else if (category === 'bed') {
    legs(0.21);
    box(0, 0.3, 0, 0.98, 0.3, 0.98);
    box(0, 0.55, 0, 0.94, 0.25, 0.93, 'fabric', '#ece8db');
    box(0, 0.71, 0.17, 0.96, 0.09, 0.61, 'fabric', product.color);
    box(0, 0.58, -0.46, 1, 0.84, 0.08, 'fabric');
    for (const x of [-0.235, 0.235])
      box(x, 0.77, -0.31, 0.4, 0.13, 0.22, 'fabric', '#f4f0e4');
    box(0, 0.775, 0.36, 0.96, 0.025, 0.14, 'fabric', '#c2b292');
  } else if (category === 'dressing_table') {
    legs(0.47);
    box(0, 0.49, 0, 1, 0.035, 1, 'wood');
    box(-0.29, 0.43, 0, 0.34, 0.1, 0.88, 'wood');
    box(-0.29, 0.43, 0.46, 0.13, 0.008, 0.015, 'metal', '#bdab86');
    box(0, 0.75, -0.39, 0.62, 0.5, 0.09, 'wood');
    box(0, 0.76, -0.335, 0.54, 0.42, 0.012, 'mirror', '#d8e2dc');
    add('cylinder', 0.35, 0.54, -0.2, 0.13, 0.06, 0.24, 'ceramic', '#ece5d9');
  } else if (category === 'plant') {
    add('cylinder', 0, 0.16, 0, 0.7, 0.32, 0.7, 'ceramic', '#eee3d2');
    add('cylinder', 0, 0.325, 0, 0.61, 0.015, 0.61, 'dark', '#57473a');
    add('cylinder', 0, 0.61, 0, 0.035, 0.57, 0.035, 'wood', '#7c8d67');
    for (let i = 0; i < 9; i++) {
      const angle = i * 2.4;
      add(
        'sphere',
        Math.cos(angle) * 0.25,
        0.55 + i * 0.039,
        Math.sin(angle) * 0.25,
        0.4,
        0.22,
        0.3,
        'fabric',
        i % 2 ? '#8da57b' : '#66805f',
      );
    }
  } else if (category === 'table' || category === 'desk') {
    legs(0.9);
    box(0, 0.94, 0, 1, 0.12, 1, 'wood');
    if (category === 'desk') {
      box(0.29, 0.66, 0, 0.32, 0.4, 0.86);
      box(0.29, 0.67, 0.44, 0.28, 0.015, 0.02, 'metal', '#555f4e');
    }
  } else if (category === 'chair' && product.room_types.includes('office')) {
    // Task-chair fallback: gas lift, wheeled base, seat, lumbar back and arms.
    add('cylinder', 0, 0.27, 0, 0.09, 0.39, 0.09, 'metal', '#575b56');
    box(0, 0.105, 0, 0.85, 0.045, 0.08, 'metal', '#474d48');
    box(0, 0.105, 0, 0.08, 0.045, 0.85, 'metal', '#474d48');
    for (const [x, z] of [
      [-0.4, 0],
      [0.4, 0],
      [0, -0.4],
      [0, 0.4],
    ])
      add('sphere', x, 0.055, z, 0.12, 0.11, 0.12, 'dark', '#303630');
    box(0, 0.43, 0.015, 0.82, 0.1, 0.78, 'fabric');
    box(0, 0.72, -0.36, 0.79, 0.48, 0.15, 'fabric');
    box(0, 0.55, -0.31, 0.67, 0.12, 0.12, 'fabric');
    box(0, 0.975, -0.36, 0.5, 0.05, 0.14, 'fabric');
    for (const x of [-0.45, 0.45]) {
      box(x, 0.51, 0.02, 0.035, 0.22, 0.05, 'metal', '#474d48');
      box(x, 0.62, 0.03, 0.1, 0.045, 0.55, 'dark', '#3c443a');
    }
  } else if (category === 'chair') {
    legs(0.5);
    box(0, 0.54, 0.03, 0.95, 0.16, 0.94, 'fabric');
    box(0, 0.79, -0.4, 0.94, 0.42, 0.14, 'fabric');
    if (product.material.includes('fabric')) {
      box(-0.44, 0.65, 0.03, 0.1, 0.17, 0.8, 'fabric');
      box(0.44, 0.65, 0.03, 0.1, 0.17, 0.8, 'fabric');
    }
  } else if (category === 'lighting') {
    parts.push({
      shape: 'cylinder',
      size: [w * 0.75, h * 0.035, d * 0.75],
      position: [0, h * 0.018, 0],
      finish: 'metal',
      color: '#a28c5d',
    });
    const diameter = Math.min(w, d) * 0.065;
    parts.push({
      shape: 'cylinder',
      size: [diameter, h * 0.72, diameter],
      position: [0, h * 0.39, 0],
      finish: 'metal',
      color: '#a28c5d',
    });
    parts.push({
      shape: 'cylinder',
      size: [w, h * 0.26, d],
      position: [0, h * 0.86, 0],
      finish: 'fabric',
      color: '#ede0be',
    });
    parts.push({
      shape: 'sphere',
      size: [w * 0.35, h * 0.07, d * 0.35],
      position: [0, h * 0.73, 0],
      finish: 'light',
      color: '#ffe6b0',
    });
  } else if (
    category === 'vanity' ||
    (category === 'storage' && product.room_types.includes('kitchen'))
  ) {
    box(0, 0.025, 0, 0.9, 0.05, 0.82, 'dark', '#484d40');
    box(0, 0.4, 0, 0.96, 0.72, 0.94);
    box(0, 0.79, 0, 1, 0.07, 1, 'stone', '#deded4');
    for (const x of [-0.25, 0.25]) {
      box(x, 0.42, 0.476, 0.46, 0.62, 0.025);
      box(x, 0.53, 0.495, 0.17, 0.018, 0.008, 'metal', '#677061');
    }
    const sinkX = category === 'vanity' ? 0 : -0.23;
    add('sphere', sinkX, 0.82, 0, 0.32, 0.04, 0.64, 'ceramic', '#faf9ed');
    add('sphere', sinkX, 0.838, 0, 0.24, 0.012, 0.48, 'dark', '#9ba99d');
    box(sinkX, 0.91, -0.31, 0.018, 0.16, 0.025, 'metal', '#adb6aa');
    box(sinkX, 0.982, -0.22, 0.025, 0.025, 0.2, 'metal', '#adb6aa');
    if (category !== 'vanity')
      for (const x of [0.2, 0.38])
        for (const z of [-0.2, 0.2])
          add('cylinder', x, 0.835, z, 0.13, 0.012, 0.22, 'dark', '#383e36');
  } else if (category === 'toilet') {
    add('sphere', 0, 0.3, 0.07, 0.7, 0.56, 0.8, 'ceramic', '#eceee6');
    box(0, 0.72, -0.34, 0.87, 0.54, 0.27, 'ceramic', '#f0f2e9');
    add('sphere', 0, 0.56, 0.15, 0.98, 0.12, 0.69, 'ceramic', '#f5f6ed');
    add('sphere', 0, 0.62, 0.15, 0.68, 0.025, 0.47, 'dark', '#a6b4a6');
    box(0, 0.995, -0.34, 0.22, 0.008, 0.1, 'metal', '#aab5a6');
  } else if (category === 'shower') {
    box(0, 0.025, 0, 1, 0.05, 1, 'ceramic', '#e7e9df');
    box(-0.49, 0.51, 0, 0.02, 0.98, 1, 'glass', '#c8e1d9');
    box(0, 0.51, 0.49, 0.98, 0.98, 0.02, 'glass', '#d5e7dc');
    for (const x of [-0.48, 0.48])
      box(x, 0.51, 0.485, 0.018, 0.98, 0.018, 'metal', '#7b8879');
    box(0.31, 0.55, -0.47, 0.025, 0.65, 0.025, 'metal', '#b5c0b0');
    box(0.19, 0.86, -0.47, 0.28, 0.025, 0.035, 'metal', '#b5c0b0');
    add('cylinder', 0.07, 0.84, -0.37, 0.22, 0.015, 0.22, 'metal', '#aab8a6');
    box(-0.03, 0.55, 0.499, 0.025, 0.1, 0.002, 'metal', '#82907e');
  } else if (category === 'rug') {
    box(0, 0.5, 0, 0.98, 1, 0.96, 'fabric');
    for (let i = 0; i < 24; i++)
      for (const z of [-0.49, 0.49])
        box(-0.46 + i * 0.04, 0.2, z, 0.012, 0.4, 0.02, 'fabric', '#dfd9c5');
  } else if (category === 'storage' && product.room_types.includes('office')) {
    box(-0.48, 0.5, 0, 0.04, 1, 1);
    box(0.48, 0.5, 0, 0.04, 1, 1);
    box(0, 0.5, -0.48, 0.94, 1, 0.04);
    for (const y of [0.025, 0.22, 0.42, 0.62, 0.82, 0.985]) {
      box(0, y, 0, 0.94, 0.03, 0.98);
      if (y > 0.83) continue;
      for (let i = 0; i < 7; i++) {
        const x = -0.38 + i * 0.105;
        const height = 0.1 + (i % 3) * 0.016;
        box(
          x,
          y + 0.016 + height / 2,
          0.02,
          0.06,
          height,
          0.58,
          'fabric',
          ['#c7bca6', '#657563', '#b48b6b', '#e4decf'][i % 4],
        );
      }
      add(
        'sphere',
        0.36,
        y + 0.065,
        0.08,
        0.16,
        0.1,
        0.4,
        'ceramic',
        '#b5ac94',
      );
    }
  } else {
    box(0, 0.025, 0, 0.9, 0.05, 0.88, 'dark', '#515845');
    box(0, 0.51, 0, 1, 0.98, 1);
    const doors = w > 0.85 ? 2 : 1;
    for (let i = 0; i < doors; i++) {
      const x = (i + 0.5) / doors - 0.5;
      box(x, 0.51, 0.49, 1 / doors - 0.015, 0.94, 0.008);
      box(x + 0.1, 0.52, 0.495, 0.012, 0.15, 0.006, 'metal', '#777e6c');
    }
    if (product.room_types.includes('office'))
      for (const y of [0.2, 0.4, 0.6, 0.8]) box(0, y, 0.04, 0.94, 0.018, 0.9);
  }
  return parts;
}
