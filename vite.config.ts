import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  // 상대 경로 base: GitHub Pages(/SE-UML-Editor/)와 로컬 preview(/) 모두에서 자산을 찾는다.
  base: './',
  plugins: [react()],
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
