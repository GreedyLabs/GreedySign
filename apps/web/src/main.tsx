/**
 * Entry — 브라우저 부트스트랩.
 *
 * 단 하나의 QueryClient 를 여기서 만들고 App 을 QueryClientProvider 로
 * 감싼다. App.tsx 내부는 `useQueryClient()` 로 같은 인스턴스를 참조해
 * router context 에 주입하므로 캐시가 분기될 여지가 없다
 * (idiomatic hardening — single source of truth).
 */
import React from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import App from './App';
import './styles/design-system.css';
import './styles/app.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // 재시도 1회 — 실제 장애와 일시적 500 을 적당히 구분.
      retry: 1,
      // SSE 가 invalidateQueries 로 live push 를 담당하므로 30s 는 안전.
      // defaultPreload: 'intent' 가 이 값을 참조해 hover 프리패치도 캐시.
      staleTime: 30_000,
    },
  },
});

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('Root element #root not found in index.html');
}

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </React.StrictMode>
);
