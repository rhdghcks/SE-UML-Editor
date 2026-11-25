import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  // 상대 경로 base: GitHub Pages(/SE-UML-Editor/)와 로컬 preview(/) 모두에서 자산을 찾는다.
  base: './',
  plugins: [react()],
  test: {
    // reports/vitest.json은 scripts/test-trace.mjs가 추적표를 만들 때 읽는다.
    reporters: ['default', ['json', { outputFile: 'reports/vitest.json' }]],
    projects: [
      {
        extends: true,
        test: { name: 'unit', environment: 'node', include: ['tests/unit/**/*.test.ts'] },
      },
      {
        extends: true,
        test: {
          name: 'integration',
          // 기본은 node. DOM이 필요한 파일만 첫 줄에 `// @vitest-environment jsdom`을 쓴다.
          environment: 'node',
          include: ['tests/integration/**/*.test.{ts,tsx}'],
          setupFiles: ['tests/setup/vitest.setup.ts'],
        },
      },
    ],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.{ts,tsx}'],
      // 타입 전용 파일과 진입점은 실행 코드가 없어 0%로 잡히므로 제외한다.
      exclude: ['src/main.tsx',
        'src/core/types.ts', 'src/core/contracts.ts', 'src/core/index.ts'],
      reporter: ['text', 'html', 'lcov', 'json-summary'],
      // 현재 수치보다 약간 낮게 잡은 하한선. 커버리지가 오르면 함께 올린다.
      // 브라우저 전용 코드(MermaidPreview, 파일 다운로드, 포인터 드래그)는 Playwright가 검증한다.
      thresholds: {
        statements: 88, branches: 85, functions: 85, lines: 88,
        'src/core/**': { statements: 95, branches: 90, functions: 95, lines: 95 },
      },
    },
  },
});
