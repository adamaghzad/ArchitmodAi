import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  timeout: 45000,
  retries: 0,
  use: {
    baseURL: 'http://127.0.0.1:5174',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1440, height: 1000 },
        launchOptions: {
          args:
            process.env.ARCHAI_HARDWARE_RENDER === '1'
              ? ['--use-angle=d3d11', '--force-high-performance-gpu']
              : [
                  '--use-gl=angle',
                  '--use-angle=swiftshader',
                  '--enable-unsafe-swiftshader',
                ],
        },
      },
    },
  ],
  webServer: [
    {
      command:
        'uv run --project backend uvicorn app.main:app --app-dir backend --host 127.0.0.1 --port 8001',
      url: 'http://127.0.0.1:8001/api/health',
      env: {
        ARCHAI_DATA_DIR: '.local/e2e',
        OLLAMA_REQUIREMENTS_MODEL: '',
        ARCHAI_EMBEDDINGS_ENABLED: 'false',
      },
      reuseExistingServer: false,
      timeout: 60000,
    },
    {
      command: 'npm run dev --workspace apps/web -- --port 5174',
      url: 'http://127.0.0.1:5174',
      env: { ARCHAI_API_URL: 'http://127.0.0.1:8001' },
      reuseExistingServer: false,
      timeout: 60000,
    },
  ],
});
