import { mkdirSync, writeFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import type { Project, RenderAuditEntry, Scene } from '../apps/web/src/types';

test('style profiles produce distinct furnished rooms in the real renderer', async ({
  page,
  request,
}) => {
  test.setTimeout(180000);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/');
  await page.getByRole('button', { name: 'New project', exact: false }).click();
  const styles = page.getByLabel('Interior style');
  for (const name of [
    'Scandinavian',
    'Japandi',
    'Korean Pastel',
    'Modern Minimalist',
    'Industrial',
  ])
    await expect(
      styles.locator('option', { hasText: new RegExp(`^${name}$`) }),
    ).toHaveCount(1);
  await page.getByRole('button', { name: 'Close new project' }).click();
  const scenes: Scene[] = [];
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  for (const style of ['Scandinavian', 'Industrial']) {
    const created = await (
      await request.post('/api/projects', {
        data: { name: `${style} knowledge check` },
      })
    ).json();
    const path = `/api/projects/${created.id}`;
    try {
      const response = await request.post(path + '/generate-plan', {
        data: {
          expected_revision: 0,
          width_m: 5,
          depth_m: 4,
          budget_mad: 30000,
          style,
          rooms: [{ type: 'bedroom', min_area_m2: 20 }],
          furnish: true,
          use_semantic: false,
        },
      });
      expect(response.status()).toBe(200);
      const project: Project = await response.json();
      const scene = project.candidate_scene!;
      scenes.push(scene);
      expect(project.report!.valid).toBeTruthy();
      expect(scene.design_brief!.profile_id).toBe(style.toLowerCase());
      await page.evaluate(
        (id) => localStorage.setItem('archai-project', id),
        created.id,
      );
      await page.reload();
      await page.getByRole('button', { name: '3D view', exact: true }).click();
      const canvas = page
        .getByRole('img', { name: 'Interactive 3D scene' })
        .locator('canvas');
      await expect
        .poll(
          async () => {
            const rows: RenderAuditEntry[] = JSON.parse(
              (await canvas.getAttribute('data-render-audit')) || '[]',
            );
            return rows.filter(
              (row) =>
                row.status === 'rendered' &&
                row.meshes > 0 &&
                row.assetStatus !== 'loading',
            ).length;
          },
          { timeout: 60000 },
        )
        .toBe(scene.furniture.length);
      await expect(canvas).toHaveAttribute('data-camera-preset', 'isometric');
      const audit: RenderAuditEntry[] = JSON.parse(
        (await canvas.getAttribute('data-render-audit'))!,
      );
      expect(audit.map((row) => row.id).sort()).toEqual(
        scene.furniture.map((item) => item.id).sort(),
      );
      const colors = audit.flatMap((row) => row.colors);
      expect(
        scene.furniture.some((item) => colors.includes(item.fabric_color!)),
      ).toBeTruthy();
      const folder = 'test-results/style-profiles';
      mkdirSync(folder, { recursive: true });
      writeFileSync(
        `${folder}/${style.toLowerCase()}.json`,
        JSON.stringify({ scene, report: project.report, audit }, null, 2),
      );
      await page.screenshot({
        path: `${folder}/${style.toLowerCase()}.png`,
        timeout: 60000,
      });
    } finally {
      await request.delete(path);
    }
  }
  expect(scenes[0].rooms[0].polygon).toEqual(scenes[1].rooms[0].polygon);
  expect(scenes[0].furniture.map((item) => item.product_id).sort()).not.toEqual(
    scenes[1].furniture.map((item) => item.product_id).sort(),
  );
  expect(scenes[0].materials.map((item) => item.product_id).sort()).not.toEqual(
    scenes[1].materials.map((item) => item.product_id).sort(),
  );
  expect(scenes[0].furniture[0].fabric_color).not.toBe(
    scenes[1].furniture[0].fabric_color,
  );
  expect(errors).toEqual([]);
});
