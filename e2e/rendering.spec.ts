import { execFileSync } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import type { Product, Scene } from '../apps/web/src/types';
import { HIGH_QUALITY_SAMPLES } from '../apps/web/src/editor3d/renderSettings';

test('Japandi office renders licensed furniture and preserves geometry and camera across modes', async ({
  page,
  request,
}, testInfo) => {
  test.setTimeout(300000);
  const seeded = JSON.parse(
    execFileSync(
      'uv',
      [
        'run',
        '--project',
        'backend',
        'python',
        'scripts/create_render_review.py',
        '--data-dir',
        '.local/e2e',
      ],
      {
        encoding: 'utf8',
        env: { ...process.env, PYTHONIOENCODING: 'utf-8' },
      },
    ),
  );
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  const folder =
    process.env.ARCHAI_HARDWARE_RENDER === '1'
      ? 'test-results/rendering-hardware'
      : 'test-results/rendering-software';
  mkdirSync(folder, { recursive: true });
  try {
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.addInitScript(
      (id) => localStorage.setItem('archai-project', id),
      seeded.id,
    );
    await page.goto('/');
    const plan = page.getByRole('img', { name: 'Editable 2D floor plan' });
    await expect(plan).toBeVisible();
    await expect(
      page.getByRole('button', {
        name: 'Select Wide work desk',
        exact: true,
      }),
    ).toBeVisible();
    await page.screenshot({ path: folder + '/office-2d.png' });
    if (process.env.ARCHAI_HARDWARE_RENDER !== '1')
      await expect(plan).toHaveScreenshot('office-plan.png', {
        maxDiffPixelRatio: 0.01,
        threshold: 0.2,
      });
    await page.getByRole('button', { name: '3D view', exact: true }).click();
    const canvas = page
      .getByRole('img', { name: 'Interactive 3D scene' })
      .locator('canvas');
    await expect(canvas).toBeVisible({ timeout: 30000 });
    await expect(canvas).toHaveAttribute('data-camera-preset', 'isometric', {
      timeout: 30000,
    });
    await expect(page.getByTestId('render-status')).toHaveText(
      'Interactive · licensed visual proxies',
      { timeout: 45000 },
    );
    await page
      .getByRole('button', { name: 'Measure FPS', exact: true })
      .click();
    await expect(canvas).toHaveAttribute('data-performance', /fps/, {
      timeout: 45000,
    });
    const performanceReport = JSON.parse(
      (await canvas.getAttribute('data-performance'))!,
    );
    const audit = JSON.parse(
      (await canvas.getAttribute('data-furniture-audit'))!,
    ) as {
      id: string;
      productId: string;
      licensed: boolean;
      dimensions: number[];
      floor: number;
      screenPoint: [number, number];
    }[];
    writeFileSync(
      folder + '/measurements.json',
      JSON.stringify(
        {
          performance: performanceReport,
          furniture: audit,
          validation: seeded.report,
        },
        null,
        2,
      ),
    );
    expect(audit).toHaveLength(7);
    expect(audit.filter((item) => item.licensed)).toHaveLength(6);
    const products: Product[] = await (
      await request.get('/api/catalogue')
    ).json();
    for (const item of audit) {
      const product = products.find((p) => p.id === item.productId)!;
      const placed = (seeded.scene as Scene).furniture.find(
        (f) => f.id === item.id,
      )!;
      const dimensions =
        placed.rotation_deg % 180 === 0
          ? [product.width_m, product.height_m, product.depth_m]
          : [product.depth_m, product.height_m, product.width_m];
      item.dimensions.forEach((value, axis) => {
        expect(value).toBeGreaterThan(0);
        expect(value).toBeLessThanOrEqual(dimensions[axis] + 1e-5);
      });
      expect(item.floor).toBeCloseTo(0.012, 3);
    }
    await page.screenshot({ path: folder + '/office-interactive.png' });
    if (process.env.ARCHAI_HARDWARE_RENDER !== '1')
      await expect(canvas).toHaveScreenshot('office-interactive.png', {
        maxDiffPixelRatio: 0.01,
        threshold: 0.25,
        timeout: 20000,
      });
    const camera = await canvas.getAttribute('data-camera-position');
    await page
      .getByRole('button', { name: 'High quality', exact: true })
      .click();
    await expect(
      page.getByRole('button', { name: 'Cancel render' }),
    ).toBeVisible();
    const renderStart = Date.now();
    await expect
      .poll(
        async () => Number(await canvas.getAttribute('data-render-samples')),
        { timeout: 180000 },
      )
      .toBeGreaterThanOrEqual(
        process.env.ARCHAI_HARDWARE_RENDER === '1' ? HIGH_QUALITY_SAMPLES : 1,
      );
    expect(await canvas.getAttribute('data-camera-position')).toBe(camera);
    await page.screenshot({ path: folder + '/office-high-quality.png' });
    const renderMilliseconds = Date.now() - renderStart;
    await page.getByRole('button', { name: 'Cancel render' }).click();
    await expect(page.getByTestId('render-status')).toContainText(
      'Interactive',
    );
    // A first trace uploads some scene-owned maps that rasterization doesn't use.
    // Compare warm resource counts across a second actual trace, then exercise
    // cancellation during preparation. Shared scene maps remain cached.
    await canvas.evaluate((element) =>
      element.removeAttribute('data-performance'),
    );
    await page
      .getByRole('button', { name: 'Measure FPS', exact: true })
      .click();
    await expect(canvas).toHaveAttribute('data-performance', /fps/, {
      timeout: 30000,
    });
    const warmResources = JSON.parse(
      (await canvas.getAttribute('data-performance'))!,
    );
    await page
      .getByRole('button', { name: 'High quality', exact: true })
      .click();
    if (process.env.ARCHAI_HARDWARE_RENDER === '1') {
      await canvas.evaluate((element) =>
        element.removeAttribute('data-render-samples'),
      );
      await expect
        .poll(
          async () => Number(await canvas.getAttribute('data-render-samples')),
          { timeout: 120000 },
        )
        .toBeGreaterThanOrEqual(1);
    }
    await page
      .getByRole('button', { name: 'Cancel render', exact: true })
      .click();
    await page
      .getByRole('button', { name: 'High quality', exact: true })
      .click();
    await page
      .getByRole('button', { name: 'Cancel render', exact: true })
      .click();
    await canvas.evaluate((element) =>
      element.removeAttribute('data-performance'),
    );
    await page
      .getByRole('button', { name: 'Measure FPS', exact: true })
      .click();
    await expect(canvas).toHaveAttribute('data-performance', /fps/, {
      timeout: 30000,
    });
    const afterCancellation = JSON.parse(
      (await canvas.getAttribute('data-performance'))!,
    );
    expect(afterCancellation.textures).toBeLessThanOrEqual(
      warmResources.textures,
    );
    expect(afterCancellation.geometries).toBeLessThanOrEqual(
      warmResources.geometries + 2,
    );
    await page.getByRole('button', { name: 'Interior eye-level view' }).click();
    await expect(canvas).toHaveAttribute('data-camera-preset', 'interior', {
      timeout: 30000,
    });
    expect(
      JSON.parse((await canvas.getAttribute('data-camera-position'))!)[1],
    ).toBeCloseTo(1.6, 2);
    await page.screenshot({ path: folder + '/office-interior.png' });
    await page
      .getByRole('button', { name: 'Isometric view', exact: true })
      .click();
    await expect(canvas).toHaveAttribute('data-camera-preset', 'isometric', {
      timeout: 30000,
    });
    const desk = audit.find((item) => item.id === 'walnut-desk')!;
    await canvas.click({
      position: { x: desk.screenPoint[0], y: desk.screenPoint[1] },
    });
    await expect(
      page.getByRole('heading', { name: 'Wide work desk', exact: true }),
    ).toBeVisible();
    await page.getByRole('button', { name: '2D plan', exact: true }).click();
    await page
      .getByRole('button', { name: 'Select Wide work desk', exact: true })
      .click();
    const after = await (
      await request.get(`/api/projects/${seeded.id}`)
    ).json();
    expect(after.candidate_scene).toEqual(seeded.scene);
    expect(after.report.valid).toBe(true);
    expect(errors).toEqual([]);
    const report = {
      performance: performanceReport,
      furniture: audit,
      validation: seeded.report,
      browser: testInfo.project.name,
      hardwareRequested: process.env.ARCHAI_HARDWARE_RENDER === '1',
      renderMilliseconds,
      afterCancellation,
      warmResources,
    };
    writeFileSync(
      folder + '/measurements.json',
      JSON.stringify(report, null, 2),
    );
    await testInfo.attach('render-measurements', {
      body: JSON.stringify(report, null, 2),
      contentType: 'application/json',
    });
  } finally {
    await request.delete(`/api/projects/${seeded.id}`);
  }
});

test('measures the office at an actual 1920 by 1080 drawing buffer', async ({
  page,
  request,
}, testInfo) => {
  test.skip(
    process.env.ARCHAI_HARDWARE_RENDER !== '1',
    'Opt-in hardware benchmark; functional rendering runs with software WebGL.',
  );
  test.setTimeout(120000);
  const seeded = JSON.parse(
    execFileSync(
      'uv',
      [
        'run',
        '--project',
        'backend',
        'python',
        'scripts/create_render_review.py',
        '--data-dir',
        '.local/e2e',
      ],
      { encoding: 'utf8', env: { ...process.env, PYTHONIOENCODING: 'utf-8' } },
    ),
  );
  try {
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.addInitScript(
      (id) => localStorage.setItem('archai-project', id),
      seeded.id,
    );
    await page.goto('/');
    await expect(
      page.getByRole('img', { name: 'Editable 2D floor plan' }),
    ).toBeVisible();
    await page.getByRole('button', { name: '3D view', exact: true }).click();
    const canvas = page
      .getByRole('img', { name: 'Interactive 3D scene' })
      .locator('canvas');
    await expect(canvas).toHaveAttribute('data-camera-preset', 'isometric', {
      timeout: 30000,
    });
    await expect(page.getByTestId('render-status')).toContainText(
      'Interactive',
      { timeout: 45000 },
    );
    await page.addStyleTag({
      content:
        '.three-canvas { position: fixed !important; inset: 0 !important; width: 1920px !important; height: 1080px !important; pointer-events: none !important; }',
    });
    await expect(canvas).toHaveAttribute('width', '1920');
    await expect(canvas).toHaveAttribute('height', '1080');
    const results = [];
    for (const detail of [true, false]) {
      await page
        .getByLabel('Contact detail', { exact: true })
        .setChecked(detail);
      await canvas.evaluate((element) =>
        element.removeAttribute('data-performance'),
      );
      await page
        .getByRole('button', { name: 'Measure FPS', exact: true })
        .click();
      await expect(canvas).toHaveAttribute('data-performance', /fps/, {
        timeout: 30000,
      });
      const result = JSON.parse(
        (await canvas.getAttribute('data-performance'))!,
      );
      expect(result.width).toBe(1920);
      expect(result.height).toBe(1080);
      expect(result.fps).toBeGreaterThan(0);
      results.push({ ...result, contactDetail: detail });
    }
    const effectResources = [];
    for (let cycle = 0; cycle < 2; cycle++) {
      for (const enabled of [true, false]) {
        await page
          .getByLabel('Contact detail', { exact: true })
          .setChecked(enabled);
        await canvas.evaluate((element) =>
          element.removeAttribute('data-performance'),
        );
        await page
          .getByRole('button', { name: 'Measure FPS', exact: true })
          .click();
        await expect(canvas).toHaveAttribute('data-performance', /fps/, {
          timeout: 30000,
        });
        if (!enabled)
          effectResources.push(
            JSON.parse((await canvas.getAttribute('data-performance'))!)
              .textures,
          );
      }
    }
    expect(effectResources).toEqual([results[1].textures, results[1].textures]);
    mkdirSync('test-results/rendering-hardware', { recursive: true });
    writeFileSync(
      'test-results/rendering-hardware/benchmark-1080p.json',
      JSON.stringify(
        {
          conditions:
            'Headless Chromium, Vite development server, stationary isometric camera, continuous demand frames, 1 s warm-up and 4 s sample',
          results,
          effectResources,
        },
        null,
        2,
      ),
    );
    await testInfo.attach('1080p measurements', {
      body: JSON.stringify(results, null, 2),
      contentType: 'application/json',
    });
  } finally {
    await request.delete(`/api/projects/${seeded.id}`);
  }
});
