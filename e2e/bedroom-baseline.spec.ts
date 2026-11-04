import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { test, expect } from '@playwright/test';

test('reproduce sparse bedroom from archived pre-fix scene', async ({
  page,
  request,
}) => {
  test.setTimeout(120000);
  const seeded = JSON.parse(
    execFileSync(
      'uv',
      [
        'run',
        '--project',
        'backend',
        'python',
        'scripts/create_bedroom_review.py',
        '--before',
        '--data-dir',
        '.local/e2e',
      ],
      { encoding: 'utf8', env: { ...process.env, PYTHONIOENCODING: 'utf-8' } },
    ),
  );
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.addInitScript(
    (id) => localStorage.setItem('archai-project', id),
    seeded.id,
  );
  await page.goto('/');
  await page.getByRole('button', { name: '3D view', exact: true }).click();
  const canvas = page
    .getByRole('img', { name: 'Interactive 3D scene' })
    .locator('canvas');
  await expect(canvas).toHaveAttribute('data-camera-preset', 'isometric', {
    timeout: 30000,
  });
  await expect(page.getByTestId('render-status')).toHaveText(
    'Interactive · licensed visual proxies',
    { timeout: 45000 },
  );
  await page.getByRole('button', { name: 'Measure FPS', exact: true }).click();
  await expect(canvas).toHaveAttribute('data-performance', /fps/, {
    timeout: 45000,
  });
  mkdirSync('test-results/bedroom-before', { recursive: true });
  await page.screenshot({ path: 'test-results/bedroom-before/before.png' });
  writeFileSync(
    'test-results/bedroom-before/before-verification.json',
    JSON.stringify(
      {
        sourceCommit: 'e72286b',
        scene: seeded.scene,
        validation: seeded.report,
        camera: JSON.parse(
          (await canvas.getAttribute('data-camera-position'))!,
        ),
        viewport: await canvas.boundingBox(),
      },
      null,
      2,
    ),
  );
  await request.delete('/api/projects/' + seeded.id);
});
