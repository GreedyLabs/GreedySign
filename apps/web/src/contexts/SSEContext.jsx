import { createContext, useContext, useEffect, useRef, useCallback } from 'react';

const SSEContext = createContext(null);

export function SSEProvider({ children }) {
  const userEventSourceRef = useRef(null);
  const docEventSourceRef = useRef(null);
  const userListenersRef = useRef(new Set());
  const docListenersRef = useRef(new Map()); // docId -> Set of listeners

  // 사용자 전역 SSE 연결
  const connectUserSSE = useCallback(() => {
    if (userEventSourceRef.current) return; // 이미 연결됨

    const token = localStorage.getItem('token');
    if (!token) return;

    userEventSourceRef.current = new EventSource(`/api/events/user?token=${encodeURIComponent(token)}`);

    userEventSourceRef.current.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data);
        userListenersRef.current.forEach(listener => listener(data));
      } catch (err) {
        console.error('SSE parse error:', err);
      }
    };

    userEventSourceRef.current.onerror = () => {
      console.warn('User SSE connection error');
    };
  }, []);

  // 사용자 SSE 리스너 추가
  const addUserListener = useCallback((listener) => {
    userListenersRef.current.add(listener);
    connectUserSSE(); // 리스너 추가 시 연결 시도

    return () => {
      userListenersRef.current.delete(listener);
      // 모든 리스너가 제거되면 연결 종료
      if (userListenersRef.current.size === 0 && userEventSourceRef.current) {
        userEventSourceRef.current.close();
        userEventSourceRef.current = null;
      }
    };
  }, [connectUserSSE]);

  // 문서별 SSE 연결
  const connectDocSSE = useCallback((docId) => {
    if (docEventSourceRef.current) return; // 이미 연결됨

    const token = localStorage.getItem('token');
    if (!token) return;

    docEventSourceRef.current = new EventSource(`/api/events/documents/${docId}?token=${encodeURIComponent(token)}`);

    docEventSourceRef.current.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data);
        const listeners = docListenersRef.current.get(docId);
        if (listeners) {
          listeners.forEach(listener => listener(data));
        }
      } catch (err) {
        console.error('SSE parse error:', err);
      }
    };

    docEventSourceRef.current.onerror = () => {
      console.warn('Doc SSE connection error');
    };
  }, []);

  // 문서 SSE 리스너 추가
  const addDocListener = useCallback((docId, listener) => {
    if (!docListenersRef.current.has(docId)) {
      docListenersRef.current.set(docId, new Set());
    }
    docListenersRef.current.get(docId).add(listener);
    connectDocSSE(docId); // 리스너 추가 시 연결 시도

    return () => {
      const listeners = docListenersRef.current.get(docId);
      if (listeners) {
        listeners.delete(listener);
        // 해당 문서의 모든 리스너가 제거되면 연결 종료
        if (listeners.size === 0) {
          docListenersRef.current.delete(docId);
          if (docEventSourceRef.current) {
            docEventSourceRef.current.close();
            docEventSourceRef.current = null;
          }
        }
      }
    };
  }, [connectDocSSE]);

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

  const value = {
    addUserListener,
    addDocListener,
  };

  return <SSEContext.Provider value={value}>{children}</SSEContext.Provider>;
}

export function useSSE() {
  const context = useContext(SSEContext);
  if (!context) {
    throw new Error('useSSE must be used within SSEProvider');
  }
  return context;
}

// 사용자 전역 이벤트 구독 훅
export function useUserSSE(onEvent) {
  const { addUserListener } = useSSE();

  useEffect(() => {
    if (!onEvent) return;
    return addUserListener(onEvent);
  }, [addUserListener, onEvent]);
}

// 문서별 이벤트 구독 훅
export function useDocSSE(docId, onEvent) {
  const { addDocListener } = useSSE();

  useEffect(() => {
    if (!docId || !onEvent) return;
    return addDocListener(docId, onEvent);
  }, [addDocListener, docId, onEvent]);
}
