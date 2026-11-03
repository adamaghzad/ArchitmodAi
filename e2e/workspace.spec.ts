import { expect, test, type Page } from '@playwright/test';

test('workspace drag, undo, materials, cameras, and snapshots stay synchronized', async ({
  page,
  request,
}) => {
  test.setTimeout(120000);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const createdProject = await createLayout(page, 'Interactive apartment');
  const path = `/api/projects/${createdProject.id}`;
  await page
    .getByRole('navigation', { name: 'Workspace navigation' })
    .getByRole('button', { name: 'Design brief', exact: true })
    .click();
  await page.getByLabel('Project budget (MAD)', { exact: true }).fill('40000');
  await page.getByRole('button', { name: 'Save brief to draft' }).click();
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await page
    .getByRole('button', { name: 'Furnish space', exact: true })
    .click();
  const sofa = page.getByRole('button', {
    name: 'Select Linen sofa',
    exact: true,
  });
  await expect(sofa).toBeVisible();
  const before = (await (await request.get(path)).json()).candidate_scene;
  const oldSofa = before.furniture.find(
    (item: { product_id: string }) => item.product_id === 'sample_sofa',
  );
  await page
    .getByRole('button', { name: 'Move furniture', exact: true })
    .click();
  const box = await sofa.boundingBox();
  expect(box).not.toBeNull();
  const change = page.waitForResponse(
    (response) =>
      response.url().endsWith('/operations') && response.status() === 200,
  );
  await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
  await page.mouse.down();
  await page.mouse.move(box!.x + box!.width / 2 + 5, box!.y + box!.height / 2, {
    steps: 5,
  });
  await page.mouse.up();
  await change;
  const moved = (await (await request.get(path)).json()).candidate_scene;
  const movedSofa = moved.furniture.find(
    (item: { id: string }) => item.id === oldSofa.id,
  );
  expect(movedSofa.position[0]).toBeGreaterThan(oldSofa.position[0]);
  expect(moved.rooms).toEqual(before.rooms);
  await page.getByRole('button', { name: 'Undo last change' }).click();
  await expect(page.getByLabel('X (m)', { exact: true })).toHaveValue(
    String(oldSofa.position[0]),
  );
  await page.getByRole('button', { name: 'Redo last change' }).click();
  await expect(page.getByLabel('X (m)', { exact: true })).toHaveValue(
    String(movedSofa.position[0]),
  );
  await page
    .getByRole('button', { name: 'Select objects', exact: true })
    .click();
  await page
    .getByRole('button', { name: 'Select Living', exact: true })
    .focus();
  await page.keyboard.press('Enter');
  await page
    .getByRole('combobox', { name: 'Floor material', exact: true })
    .selectOption('oak_floor');
  const material = page.waitForResponse(
    (response) =>
      response.url().endsWith('/products') &&
      response.request().method() === 'POST' &&
      response.status() === 200,
  );
  await page
    .getByRole('button', { name: 'Apply floor material', exact: true })
    .click();
  await material;
  const canvas = page
    .getByRole('img', { name: 'Interactive 3D scene' })
    .locator('canvas');
  await expect(canvas).toBeVisible({ timeout: 30000 });
  await page.getByRole('button', { name: 'Top view', exact: true }).click();
  await expect(canvas).toHaveAttribute('data-camera-preset', 'top', {
    timeout: 15000,
  });
  const top = JSON.parse((await canvas.getAttribute('data-camera-position'))!);
  expect(top[1]).toBeGreaterThan(Math.abs(top[2]) * 10);
  await page
    .getByRole('button', { name: 'Perspective view', exact: true })
    .click();
  await expect(canvas).toHaveAttribute('data-camera-preset', 'perspective', {
    timeout: 15000,
  });
  await page
    .getByRole('button', { name: 'Fit scene to view', exact: true })
    .click();
  await expect(canvas).toHaveAttribute('data-camera-preset', 'fit', {
    timeout: 15000,
  });
  await page.screenshot({
    path: 'test-results/upgraded-apartment-3d.png',
    fullPage: true,
  });
  const after = await (await request.get(path)).json();
  expect(
    after.candidate_scene.materials.some(
      (item: { product_id: string }) => item.product_id === 'oak_floor',
    ),
  ).toBeTruthy();
  expect(after.report.valid).toBeTruthy();
  await page.getByRole('button', { name: '2D plan', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Select Linen sofa', exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: 'test-results/upgraded-apartment-2d.png',
    fullPage: true,
  });
  await page
    .getByRole('button', { name: 'Approve draft', exact: true })
    .click();
  await expect(page.getByText('Approved snapshot saved locally')).toBeVisible();
  await page
    .getByRole('navigation', { name: 'Workspace navigation' })
    .getByRole('button', { name: 'Project versions', exact: true })
    .click();
  await expect(
    page.getByRole('button', { name: 'Restore as draft' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Restore as draft' }).click();
  await expect(
    page.getByRole('button', { name: 'Approve draft', exact: true }),
  ).toBeEnabled();
  expect(errors).toEqual([]);
});

test('unavailable registered GLB uses a cached procedural fallback', async ({
  page,
}) => {
  test.setTimeout(90000);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  let attempts = 0;
  await page.route('**/assets/registry.json', (route) =>
    route.fulfill({
      json: {
        models: [
          {
            id: 'test-fallback',
            productId: 'sample_sofa',
            url: '/assets/models/unavailable.glb',
            source: 'Local test fixture',
            license: 'Test authored in repository',
          },
        ],
      },
    }),
  );
  await page.route('**/assets/models/unavailable.glb', (route) => {
    attempts++;
    return route.fulfill({
      status: 200,
      contentType: 'model/gltf-binary',
      body: 'not a valid GLB',
    });
  });
  await createLayout(page, 'Asset fallback');
  await page
    .getByRole('button', { name: 'Furnish space', exact: true })
    .click();
  await expect(
    page.getByRole('button', { name: 'Select Linen sofa', exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: '3D view', exact: true }).click();
  const canvas = page
    .getByRole('img', { name: 'Interactive 3D scene' })
    .locator('canvas');
  await expect(canvas).toBeVisible({ timeout: 30000 });
  await expect.poll(() => attempts).toBe(1);
  await page.getByRole('button', { name: 'Reset camera' }).click();
  await expect(canvas).toHaveAttribute('data-camera-preset', 'reset', {
    timeout: 15000,
  });
  await page.getByRole('button', { name: '2D plan', exact: true }).click();
  await page.getByRole('button', { name: '3D view', exact: true }).click();
  await expect(canvas).toBeVisible({ timeout: 30000 });
  expect(attempts).toBe(1);
  expect(errors).toEqual([]);
});

test('marketplace filters, compares, adds, replaces, calculates materials, and exports', async ({
  page,
}) => {
  test.setTimeout(75000);
  await createLayout(page, 'E2E marketplace');
  await page
    .getByRole('banner')
    .getByRole('button', { name: 'Marketplace', exact: true })
    .click();
  const market = page.getByRole('dialog', { name: 'Furniture & materials' });
  await expect(market.getByText('52 products · mock_data')).toBeVisible();
  await market
    .getByRole('combobox', { name: 'Category', exact: true })
    .selectOption('sofa');
  await market.getByLabel('Max price (MAD)', { exact: true }).fill('5000');
  await market.getByRole('button', { name: 'Apply filters' }).click();
  await expect(market.getByText('3 products · mock_data')).toBeVisible();
  await market.getByLabel('Compare Linen sofa', { exact: true }).check();
  await market
    .getByLabel('Compare Small linen loveseat', { exact: true })
    .check();
  await market
    .getByRole('button', { name: 'Compare (2/4)', exact: true })
    .click();
  await expect(
    market.getByRole('heading', { name: 'Product comparison' }),
  ).toBeVisible();
  const sofa = market.locator('article.market-product').filter({
    has: page.getByRole('heading', { name: 'Linen sofa', exact: true }),
  });
  await sofa.getByRole('button', { name: 'Add to design' }).click();
  await expect(market.getByRole('status')).toContainText('Linen sofa added');
  await market.getByRole('tab', { name: /Shopping list/ }).click();
  await market.getByRole('button', { name: 'Replace Linen sofa' }).click();
  const loveseat = market.locator('article.market-product').filter({
    has: page.getByRole('heading', {
      name: 'Small linen loveseat',
      exact: true,
    }),
  });
  await loveseat.getByRole('button', { name: 'Replace item' }).click();
  await expect(market.getByRole('status')).toContainText(
    'replaced the selected item',
  );
  await market
    .getByRole('combobox', { name: 'Category', exact: true })
    .selectOption('flooring');
  await market.getByRole('button', { name: 'Apply filters' }).click();
  const floor = market.locator('article.market-product').filter({
    has: page.getByRole('heading', {
      name: 'Natural oak laminate',
      exact: true,
    }),
  });
  await floor.getByRole('button', { name: 'Add to design' }).click();
  await expect(market.getByRole('status')).toContainText(
    'Natural oak laminate added',
  );
  await page.screenshot({
    path: 'test-results/marketplace-desktop.png',
    fullPage: true,
  });
  await market.getByRole('tab', { name: /Shopping list/ }).click();
  await expect(
    market.getByRole('cell', { name: '10 pack', exact: true }),
  ).toBeVisible();
  // With only mock selections, the sample subtotal and project estimate match.
  await expect(market.getByText('4,600 MAD', { exact: true })).toHaveCount(2);
  for (const format of ['CSV', 'PDF']) {
    const download = page.waitForEvent('download');
    await market.getByRole('link', { name: format, exact: true }).click();
    expect((await download).suggestedFilename()).toBe(
      `shopping-list.${format.toLowerCase()}`,
    );
  }
  await market
    .getByRole('tab', { name: 'Recommendations', exact: true })
    .click();
  await market
    .getByRole('button', { name: 'Find matching products', exact: true })
    .click();
  await expect(market.getByRole('status')).toContainText(
    'Recommendations ready',
  );
  await market
    .getByRole('button', { name: 'Reject', exact: true })
    .first()
    .click();
  await expect(market.getByText('rejected', { exact: true })).toBeVisible();
  await market
    .getByRole('button', { name: 'Accept', exact: true })
    .first()
    .click();
  await expect(market.getByRole('status')).toContainText('Suggestion accepted');
  await market.getByRole('button', { name: 'Preview in 3D' }).click();
  await expect(
    page.getByRole('img', { name: 'Interactive 3D scene' }).locator('canvas'),
  ).toBeVisible({ timeout: 20000 });
  await page.waitForTimeout(1500);
  await page.screenshot({
    path: 'test-results/workspace-3d.png',
    fullPage: true,
  });
});

const created: string[] = [];
test.afterEach(async ({ request }) => {
  for (const id of created.splice(0))
    await request.delete(`/api/projects/${id}`);
});

async function createLayout(page: Page, name = 'E2E apartment') {
  await page.goto('/');
  await page
    .getByRole('button', { name: 'Generate a plan', exact: false })
    .click();
  await page.getByLabel('Project name').fill(name);
  const response = page.waitForResponse(
    (response) =>
      response.url().endsWith('/generate-plan') && response.status() === 200,
  );
  await page
    .getByRole('button', { name: 'Generate layout', exact: true })
    .click();
  const project = await (await response).json();
  created.push(project.id);
  await expect(
    page.getByRole('img', { name: 'Editable 2D floor plan' }),
  ).toBeVisible();
  return project;
}

test('generate, furnish, inspect both views, approve, reopen, and export', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await createLayout(page);
  await page.getByRole('button', { name: 'Furnish space' }).click();
  await expect(
    page.getByRole('button', { name: 'Select Linen sofa' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Select Linen sofa' }).click();
  await expect(page.getByRole('heading', { name: 'Linen sofa' })).toBeVisible();
  await page.getByRole('button', { name: '3D view', exact: true }).click();
  await expect(
    page.getByRole('img', { name: 'Interactive 3D scene' }).locator('canvas'),
  ).toBeVisible({ timeout: 20000 });
  await page.waitForTimeout(1500);
  await page.getByRole('button', { name: '2D plan', exact: true }).click();
  await page.getByRole('tab', { name: 'Checks', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Geometry checks pass' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Approve draft' }).click();
  await expect(page.getByText('Approved snapshot saved locally')).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole('button', { name: 'Select Linen sofa' }),
  ).toBeVisible();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export scene JSON' }).click();
  expect((await download).suggestedFilename()).toBe('e2e-apartment.json');
  await page.screenshot({
    path: 'test-results/workspace-desktop.png',
    fullPage: true,
  });
  expect(errors).toEqual([]);
});

test('invalid furniture edit blocks approval and discard restores the saved scene', async ({
  page,
}) => {
  await createLayout(page, 'E2E correction');
  await page.getByRole('button', { name: 'Furnish space' }).click();
  await expect(
    page.getByRole('button', { name: 'Select Linen sofa' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Approve draft' }).click();
  await expect(page.getByText('Approved snapshot saved locally')).toBeVisible();
  await page.getByRole('button', { name: 'Select Linen sofa' }).click();
  await page.getByLabel('X (m)', { exact: true }).fill('-3');
  await page.getByRole('button', { name: 'Apply position' }).click();
  await expect(
    page.getByRole('heading', { name: 'Review needed' }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Approve draft' }),
  ).toBeDisabled();
  await page.getByRole('button', { name: 'Discard draft' }).click();
  await expect(
    page.getByRole('heading', { name: 'Geometry checks pass' }),
  ).toBeVisible();
  await expect(page.getByText('Approved snapshot saved locally')).toBeVisible();
});

test('impossible room areas produce an explicit error', async ({ page }) => {
  await page.goto('/');
  await page
    .getByRole('button', { name: 'Generate a plan', exact: false })
    .click();
  await page.getByLabel('Width (m)', { exact: true }).fill('3');
  await page.getByLabel('Depth (m)', { exact: true }).fill('3');
  await page
    .getByRole('button', { name: 'Generate layout', exact: true })
    .click();
  await expect(page.getByRole('alert')).toContainText(
    'minimum room areas exceed',
  );
  await expect(page.getByRole('dialog')).toBeVisible();
});

test('upload a reference and confirm its dimensions on a narrow screen', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page
    .getByRole('button', { name: 'Upload a plan', exact: false })
    .click();
  await page.getByLabel('Project name').fill('E2E imported reference');
  await page.getByLabel('Floor plan file').setInputFiles({
    name: 'reference.png',
    mimeType: 'image/png',
    buffer: Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aYoQAAAAASUVORK5CYII=',
      'base64',
    ),
  });
  const response = page.waitForResponse(
    (response) =>
      response.url().endsWith('/upload-plan') && response.status() === 200,
  );
  await page
    .getByRole('button', { name: 'Import reference', exact: true })
    .click();
  const project = await (await response).json();
  created.push(project.id);
  await expect(
    page.getByRole('img', {
      name: 'Imported floor plan reference awaiting scale calibration',
    }),
  ).toBeVisible();
  await page
    .getByRole('button', { name: 'Analyze reference with OpenCV' })
    .click();
  await expect(
    page.getByText('0 unreviewed line proposals', { exact: false }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Create review outline' }),
  ).toBeDisabled();
  await page.getByLabel('I confirm these full-footprint dimensions.').check();
  await page.getByRole('button', { name: 'Create review outline' }).click();
  await expect(
    page.getByRole('img', { name: 'Editable 2D floor plan' }),
  ).toBeVisible();
  await expect(
    page.getByText('calibrated outline, not detected geometry', {
      exact: false,
    }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBeTruthy();
  await page.screenshot({
    path: 'test-results/workspace-mobile.png',
    fullPage: true,
  });
});
