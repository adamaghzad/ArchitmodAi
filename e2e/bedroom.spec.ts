import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { cameraPose } from '../apps/web/src/sceneGeometry';
import type { Product, Project, RenderAuditEntry } from '../apps/web/src/types';

test('pastel brief produces complete furniture, applied finishes and matching 2D/3D objects', async ({
  page,
  request,
}) => {
  test.setTimeout(process.env.ARCHAI_HARDWARE_RENDER === '1' ? 150000 : 240000);
  const screenshotTimeout =
    process.env.ARCHAI_HARDWARE_RENDER === '1' ? 30000 : 60000;
  page.setDefaultTimeout(30000);
  const errors: string[] = [];
  const renderLogs: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
    if (message.text().includes('"stage":"rendering"'))
      renderLogs.push(message.text());
  });
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/');
  await page.getByRole('button', { name: 'New project', exact: false }).click();
  await page.getByLabel('Project name').fill('Pastel bedroom acceptance');
  await page.getByLabel('Width (m)', { exact: true }).fill('5');
  await page.getByLabel('Depth (m)', { exact: true }).fill('4');
  for (const number of [4, 3, 2])
    await page
      .getByRole('button', { name: `Remove room ${number}`, exact: true })
      .click();
  await page.getByLabel('Room 1 type').selectOption('bedroom');
  await page.getByLabel('Room 1 minimum area').fill('20');
  await page
    .getByText('Furniture, palette and text brief', { exact: true })
    .click();
  const prompt =
    'A cute pastel bedroom with a double bed with upholstered headboard, two bedside tables, vanity desk and mirror, wardrobe, reading armchair, small bookshelf, rug, two lamps and two decorative plants. Blush pink, warm cream, sage green, light oak, soft fabrics and warm natural lighting.';
  await page.getByLabel('Design brief', { exact: true }).fill(prompt);
  const generated = page.waitForResponse(
    (response) =>
      response.url().endsWith('/generate-plan') &&
      response.request().method() === 'POST',
  );
  await page
    .getByRole('button', { name: 'Generate design', exact: true })
    .click();
  const response = await generated;
  expect(response.status()).toBe(200);
  const project: Project = await response.json();
  const path = '/api/projects/' + project.id;
  try {
    const scene = project.candidate_scene!;
    expect(scene.design_brief!.prompt).toBe(prompt);
    expect(project.report!.completeness!.complete).toBeTruthy();
    expect(scene.furniture).toHaveLength(12);
    const report = page.getByTestId('design-completeness');
    await expect(report).toContainText('13/13 requested items/features');
    const products: Product[] = await (
      await request.get('/api/catalogue')
    ).json();
    expect(scene.rooms[0].color).toBe(
      products.find((product) => product.id === 'pastel_oak_floor')!.color,
    );
    const counts = new Map<string, number>();
    scene.furniture.forEach((item) =>
      counts.set(item.product_id, (counts.get(item.product_id) || 0) + 1),
    );
    for (const [id, count] of counts)
      await expect(
        page.getByRole('button', {
          name: 'Select ' + products.find((product) => product.id === id)!.name,
          exact: true,
        }),
      ).toHaveCount(count);
    const folder =
      process.env.ARCHAI_HARDWARE_RENDER === '1'
        ? 'test-results/bedroom-hardware'
        : 'test-results/bedroom-software';
    mkdirSync(folder, { recursive: true });
    await page.screenshot({
      path: folder + '/plan.png',
      timeout: screenshotTimeout,
    });
    await page.getByRole('button', { name: '3D view', exact: true }).click();
    const canvas = page
      .getByRole('img', { name: 'Interactive 3D scene' })
      .locator('canvas');
    await expect(canvas).toHaveAttribute('data-camera-preset', 'isometric', {
      timeout: 30000,
    });
    await expect
      .poll(
        async () => {
          const rows: RenderAuditEntry[] = JSON.parse(
            (await canvas.getAttribute('data-render-audit')) || '[]',
          );
          return rows.filter(
            (row) => row.status === 'rendered' && row.assetStatus !== 'loading',
          ).length;
        },
        { timeout: 60000 },
      )
      .toBe(12);
    await page
      .getByRole('button', { name: 'Measure FPS', exact: true })
      .click();
    await expect(canvas).toHaveAttribute('data-performance', /fps/, {
      timeout: 45000,
    });
    const camera = JSON.parse(
      (await canvas.getAttribute('data-camera-position'))!,
    );
    const bounds = (await canvas.boundingBox())!;
    const expectedCamera = cameraPose(
      scene,
      bounds.width / bounds.height,
    ).position;
    camera.forEach((value: number, i: number) =>
      expect(value).toBeCloseTo(expectedCamera[i], 6),
    );
    const beforeCamera = JSON.parse(
      readFileSync('docs/bedroom/before-verification.json', 'utf8'),
    ).camera;
    expect(camera).toEqual(beforeCamera);
    const audit: RenderAuditEntry[] = JSON.parse(
      (await canvas.getAttribute('data-render-audit'))!,
    );
    expect(audit.map((row) => row.id).sort()).toEqual(
      scene.furniture.map((item) => item.id).sort(),
    );
    expect(audit.filter((row) => row.assetStatus === 'licensed')).toHaveLength(
      3,
    );
    expect(
      audit.find((row) => row.productId === 'pastel_double_bed')!.colors,
    ).toContain('#d9aeb6');
    expect(
      audit.find((row) => row.productId === 'fabric_chair')!.colors,
    ).toContain('#9baa95');
    const materialAudit = JSON.parse(
      (await canvas.getAttribute('data-material-audit'))!,
    );
    expect(materialAudit[0].color).toBe(
      products.find((product) => product.id === 'pastel_oak_floor')!.color,
    );
    expect(
      materialAudit[0].normalMap && materialAudit[0].roughnessMap,
    ).toBeTruthy();
    const dimensions = JSON.parse(
      (await canvas.getAttribute('data-furniture-audit'))!,
    );
    for (const row of dimensions) {
      const item = scene.furniture.find((item) => item.id === row.id)!;
      const product = products.find(
        (product) => product.id === item.product_id,
      )!;
      expect(row.floor).toBeCloseTo(0.012 + (item.elevation_m || 0), 3);
      const envelope =
        item.rotation_deg % 180 === 0
          ? [product.width_m, product.height_m, product.depth_m]
          : [product.depth_m, product.height_m, product.width_m];
      row.dimensions.forEach((size: number, i: number) =>
        expect(size).toBeLessThanOrEqual(envelope[i] + 1e-4),
      );
    }
    await page.screenshot({
      path: folder + '/after.png',
      timeout: screenshotTimeout,
    });
    const bed = dimensions.find(
      (item: { productId: string }) => item.productId === 'pastel_double_bed',
    );
    await page.mouse.click(
      bounds.x + bed.screenPoint[0],
      bounds.y + bed.screenPoint[1],
    );
    await expect(
      page.getByRole('heading', {
        name: 'Upholstered double bed with headboard',
        exact: true,
      }),
    ).toBeVisible();
    const after = await (await request.get(path)).json();
    expect(after.candidate_scene).toEqual(scene);
    expect(renderLogs.length).toBeGreaterThanOrEqual(12);
    expect(errors).toEqual([]);
    writeFileSync(
      folder + '/verification.json',
      JSON.stringify(
        {
          scene,
          validation: project.report,
          renderAudit: audit,
          materialAudit,
          furnitureBounds: dimensions,
          camera,
          viewport: bounds,
          gpu: await canvas.getAttribute('data-gpu'),
          performance: JSON.parse(
            (await canvas.getAttribute('data-performance'))!,
          ),
          errors,
        },
        null,
        2,
      ),
    );
  } finally {
    await request.delete(path);
  }
});

test('budget shortfall and unsupported furniture remain visible in the design report', async ({
  page,
  request,
}) => {
  test.setTimeout(120000);
  const created = await (
    await request.post('/api/projects', {
      data: { name: 'Budget-limited bedroom' },
    })
  ).json();
  const path = '/api/projects/' + created.id;
  try {
    const response = await request.post(path + '/generate-plan', {
      timeout: 60000,
      data: {
        expected_revision: 0,
        width_m: 5,
        depth_m: 4,
        budget_mad: 4500,
        rooms: [{ type: 'bedroom', min_area_m2: 20 }],
        prompt:
          'A cute pastel bedroom with a double bed, two bedside tables, wardrobe, rug, lamps and a piano.',
        furnish: true,
      },
    });
    expect(response.status()).toBe(200);
    const project: Project = await response.json();
    expect(project.report!.valid).toBeTruthy();
    expect(project.report!.completeness!.complete).toBeFalsy();
    expect(project.report!.completeness!.correction_attempts).toBe(2);
    expect(project.candidate_scene!.furniture.length).toBeGreaterThan(0);
    await page.addInitScript(
      (id) => localStorage.setItem('archai-project', id),
      created.id,
    );
    await page.goto('/');
    const report = page.getByTestId('design-completeness');
    await expect(report).toContainText('Design needs review');
    await report.locator(':scope > summary').click();
    await expect(report).toContainText('Remaining budget');
    await expect(report).toContainText('piano');
    await expect(report).toContainText(
      'No catalogue product supports this requirement',
    );
    expect(project.report!.total_mad).toBeLessThanOrEqual(4500);
  } finally {
    await request.delete(path);
  }
});
