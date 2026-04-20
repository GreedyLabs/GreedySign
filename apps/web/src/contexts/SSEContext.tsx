import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useCallback,
  type ReactNode,
} from 'react';

/**
 * SSE 이벤트 페이로드. 서버 `services/sse.ts` 가 보내는 union 타입.
 * `type` 만 좁혀쓰고 나머지는 자유 객체로 유지 — 각 소비자가 필요한 키만
 * 옵셔널로 꺼낸다. 엄격히 분기하고 싶으면 discriminated union 으로 확장.
 */
export interface SseEvent {
  type: string;
  [key: string]: unknown;
}

type Listener = (event: SseEvent) => void;

interface SSEContextValue {
  addUserListener: (listener: Listener) => () => void;
  addDocListener: (docId: string | number, listener: Listener) => () => void;
}

const SSEContext = createContext<SSEContextValue | null>(null);

interface SSEProviderProps {
  children: ReactNode;
}

export function SSEProvider({ children }: SSEProviderProps) {
  const userEventSourceRef = useRef<EventSource | null>(null);
  const docEventSourceRef = useRef<EventSource | null>(null);
  const userListenersRef = useRef<Set<Listener>>(new Set());
  const docListenersRef = useRef<Map<string, Set<Listener>>>(new Map());

  // 사용자 전역 SSE 연결
  const connectUserSSE = useCallback(() => {
    if (userEventSourceRef.current) return; // 이미 연결됨

    const token = localStorage.getItem('token');
    if (!token) return;

    const source = new EventSource(
      `/api/events/user?token=${encodeURIComponent(token)}`,
    );
    userEventSourceRef.current = source;

    source.onmessage = (e: MessageEvent) => {
      try {
        const data = JSON.parse(e.data) as SseEvent;
        userListenersRef.current.forEach((listener) => listener(data));
      } catch (err) {
        console.error('SSE parse error:', err);
      }
    };

    source.onerror = () => {
      console.warn('User SSE connection error');
    };
  }, []);

  // 사용자 SSE 리스너 추가
  const addUserListener = useCallback(
    (listener: Listener): (() => void) => {
      userListenersRef.current.add(listener);
      connectUserSSE(); // 리스너 추가 시 연결 시도

      return () => {
        userListenersRef.current.delete(listener);
        // 모든 리스너가 제거되면 연결 종료
        if (
          userListenersRef.current.size === 0 &&
          userEventSourceRef.current
        ) {
          userEventSourceRef.current.close();
          userEventSourceRef.current = null;
        }
      };
    },
    [connectUserSSE],
  );

  // 문서별 SSE 연결
  const connectDocSSE = useCallback((docId: string | number) => {
    if (docEventSourceRef.current) return; // 이미 연결됨

    const token = localStorage.getItem('token');
    if (!token) return;

    const source = new EventSource(
      `/api/events/documents/${docId}?token=${encodeURIComponent(token)}`,
    );
    docEventSourceRef.current = source;

    source.onmessage = (e: MessageEvent) => {
      try {
        const data = JSON.parse(e.data) as SseEvent;
        const listeners = docListenersRef.current.get(String(docId));
        if (listeners) {
          listeners.forEach((listener) => listener(data));
        }
      } catch (err) {
        console.error('SSE parse error:', err);
      }
    };

    source.onerror = () => {
      console.warn('Doc SSE connection error');
    };
  }, []);

  // 문서 SSE 리스너 추가
  const addDocListener = useCallback(
    (docId: string | number, listener: Listener): (() => void) => {
      const key = String(docId);
      if (!docListenersRef.current.has(key)) {
        docListenersRef.current.set(key, new Set());
      }
      docListenersRef.current.get(key)!.add(listener);
      connectDocSSE(docId); // 리스너 추가 시 연결 시도

      return () => {
        const listeners = docListenersRef.current.get(key);
        if (listeners) {
          listeners.delete(listener);
          // 해당 문서의 모든 리스너가 제거되면 연결 종료
          if (listeners.size === 0) {
            docListenersRef.current.delete(key);
            if (docEventSourceRef.current) {
              docEventSourceRef.current.close();
              docEventSourceRef.current = null;
            }
          }
        }
      };
    },
    [connectDocSSE],
  );

  // 컴포넌트 언마운트 시 모든 연결 종료
  useEffect(() => {
    return () => {
      if (userEventSourceRef.current) {
        userEventSourceRef.current.close();
      }
      if (docEventSourceRef.current) {
        docEventSourceRef.current.close();
      }
    };
  }, []);

  const value: SSEContextValue = {
    addUserListener,
    addDocListener,
  };

  return <SSEContext.Provider value={value}>{children}</SSEContext.Provider>;
}

export function useSSE(): SSEContextValue {
  const context = useContext(SSEContext);
  if (!context) {
    throw new Error('useSSE must be used within SSEProvider');
  }
  return context;
}

/** 사용자 전역 이벤트 구독 훅 */
export function useUserSSE(onEvent: Listener | undefined | null): void {
  const { addUserListener } = useSSE();

  useEffect(() => {
    if (!onEvent) return;
    return addUserListener(onEvent);
  }, [addUserListener, onEvent]);
}

/** 문서별 이벤트 구독 훅 */
export function useDocSSE(
  docId: string | number | null | undefined,
  onEvent: Listener | undefined | null,
): void {
  const { addDocListener } = useSSE();

  useEffect(() => {
    if (!docId || !onEvent) return;
    return addDocListener(docId, onEvent);
  }, [addDocListener, docId, onEvent]);
}
