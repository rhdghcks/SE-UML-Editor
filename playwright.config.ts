import { defineConfig, devices } from '@playwright/test';
import { defineBddConfig } from 'playwright-bdd';

// 인수 테스트: .feature 시나리오를 Playwright 테스트로 생성한다 (bddgen).
const acceptanceDir = defineBddConfig({
  features: 'tests/acceptance/features/*.feature',
  steps: 'tests/acceptance/steps/*.ts',
  outputDir: 'tests/acceptance/.features-gen',
});

export default defineConfig({
  // CI에서 test.only가 남아 있으면 실패시킨다 (docs/TESTING.md 공통 규칙 9).
  forbidOnly: Boolean(process.env.CI),
  // reports/playwright.json은 scripts/test-trace.mjs가 추적표를 만들 때 읽는다.
  reporter: [
    ...(process.env.CI ? [['github'], ['html', { open: 'never' }]] as const : []),
    ['list'],
    ['json', { outputFile: 'reports/playwright.json' }],
  ],
  use: { baseURL: 'http://127.0.0.1:4173', trace: 'retain-on-failure' },
  webServer: {
    command: 'npm run preview -- --host 127.0.0.1',
    url: 'http://127.0.0.1:4173',
  },
  projects: [
    { name: 'system', testDir: 'tests/system', use: { ...devices['Desktop Chrome'] } },
    { name: 'acceptance', testDir: acceptanceDir, use: { ...devices['Desktop Chrome'] } },
  ],
});
