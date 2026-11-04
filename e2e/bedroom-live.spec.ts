import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { test, expect } from '@playwright/test';
import type { RenderAuditEntry } from '../apps/web/src/types';

test('recorded live Ollama bedroom renders every canonical object with the comparison camera', async ({
  page,
  request,
}) => {
  test.setTimeout(180000);
  const seeded = JSON.parse(
    execFileSync(
      'uv',
      [
        'run',
        '--project',
        'backend',
        'python',
        'scripts/create_bedroom_review.py',
        '--data-dir',
        '.local/e2e',
        '--recorded-live',
      ],
      { encoding: 'utf8', env: { ...process.env, PYTHONIOENCODING: 'utf-8' } },
    ),
  );
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  try {
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
    await expect
      .poll(
        async () => {
          const audit: RenderAuditEntry[] = JSON.parse(
            (await canvas.getAttribute('data-render-audit')) || '[]',
          );
          return audit.filter(
            (item) =>
              item.status === 'rendered' && item.assetStatus !== 'loading',
          ).length;
        },
        { timeout: 60000 },
      )
      .toBe(seeded.scene.furniture.length);
    await page
      .getByRole('button', { name: 'Measure FPS', exact: true })
      .click();
    await expect(canvas).toHaveAttribute('data-performance', /fps/, {
      timeout: 45000,
    });
    const camera = JSON.parse(
      (await canvas.getAttribute('data-camera-position'))!,
    );
    const before = JSON.parse(
      readFileSync('docs/bedroom/before-verification.json', 'utf8'),
    );
    expect(camera).toEqual(before.camera);
    const audit: RenderAuditEntry[] = JSON.parse(
      (await canvas.getAttribute('data-render-audit'))!,
    );
    expect(audit.map((item) => item.id).sort()).toEqual(
      seeded.scene.furniture.map((item: { id: string }) => item.id).sort(),
    );
    expect(seeded.report.completeness.complete).toBeTruthy();
    expect(seeded.report.completeness.placed_count).toBe(13);
    expect(errors).toEqual([]);
    const folder = 'test-results/bedroom-live';
    mkdirSync(folder, { recursive: true });
    await page.screenshot({ path: folder + '/after-live.png', timeout: 60000 });
    writeFileSync(
      folder + '/render-verification.json',
      JSON.stringify(
        {
          scene: seeded.scene,
          validation: seeded.report,
          camera,
          renderAudit: audit,
          furnitureBounds: JSON.parse(
            (await canvas.getAttribute('data-furniture-audit'))!,
          ),
          materialAudit: JSON.parse(
            (await canvas.getAttribute('data-material-audit'))!,
          ),
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
    await request.delete('/api/projects/' + seeded.id);
  }
});
