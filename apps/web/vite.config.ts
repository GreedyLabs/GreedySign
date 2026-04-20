import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { TanStackRouterVite } from '@tanstack/router-plugin/vite';

// TanStack Router 의 파일 라우팅 플러그인이 `src/routes/` 트리를 스캔해
// `src/routeTree.gen.ts` 를 생성한다. 이 파일이 라우트 인스턴스의 단일
// 진입점이며, react 플러그인보다 먼저 등록되어야 한다 (코드 변환 순서).
export default defineConfig({
  plugins: [
    TanStackRouterVite({ target: 'react', autoCodeSplitting: true }),
    react(),
  ],
  server: {
    proxy: {
      '/api': 'http://localhost:3001',
    },
  },
});
