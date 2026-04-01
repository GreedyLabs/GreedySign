import { useEffect, useState } from 'react';
import { GoogleOAuthProvider } from '@react-oauth/google';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useAuthStore } from './stores/authStore';
import { SSEProvider } from './contexts/SSEContext';
import AuthPage from './components/AuthPage';
import Dashboard from './components/Dashboard';
import EditorPage from './components/EditorPage';
import InvitePage from './components/InvitePage';
import api from './services/api';

const queryClient = new QueryClient();

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || '';

const UUID_RE = /^[a-f0-9-]{36}$/;

function parsePath() {
  const { pathname } = window.location;
  const inviteMatch = pathname.match(/^\/invite\/([a-f0-9-]{36})$/);
  if (inviteMatch) return { type: 'invite', token: inviteMatch[1] };
  const docMatch = pathname.match(/^\/documents\/([a-f0-9-]{36})$/);
  if (docMatch && UUID_RE.test(docMatch[1])) return { type: 'doc', docId: docMatch[1] };
  return { type: 'home' };
}

export default function App() {
  const { user, loading, init } = useAuthStore();
  const [route, setRoute] = useState(parsePath);
  const [currentDocId, setCurrentDocId] = useState(route.type === 'doc' ? route.docId : null);
  const [inviteEmail, setInviteEmail] = useState(null);

  useEffect(() => { init(); }, []);

  useEffect(() => {
    if (route.type !== 'invite') return;
    api.get(`/invite/${route.token}`)
      .then(({ data }) => setInviteEmail(data.invitee_email))
      .catch(() => {});
  }, []);

  const openDoc = (docId) => {
    window.history.pushState({}, '', `/documents/${docId}`);
    setCurrentDocId(docId);
  };

  const closeDoc = () => {
    window.history.pushState({}, '', '/');
    setCurrentDocId(null);
  };

  const handleInviteAccepted = (docId) => {
    window.history.replaceState({}, '', `/documents/${docId}`);
    setRoute({ type: 'doc', docId });
    setCurrentDocId(docId);
  };

  if (loading) return (
    <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f5f5f5' }}>
      <p style={{ color: '#6b7280', fontSize: 15 }}>로딩 중...</p>
    </div>
  );

  if (route.type === 'invite') {
    if (!user) return (
      <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}>
        <AuthPage inviteEmail={inviteEmail} />
      </GoogleOAuthProvider>
    );
    return (
      <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}>
        <InvitePage token={route.token} onAccepted={handleInviteAccepted} />
      </GoogleOAuthProvider>
    );
  }

  return (
    <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}>
      <QueryClientProvider client={queryClient}>
        <SSEProvider>
          {!user ? (
            <AuthPage />
          ) : currentDocId ? (
            <EditorPage docId={currentDocId} onBack={closeDoc} />
          ) : (
            <Dashboard onOpenDoc={openDoc} />
          )}
        </SSEProvider>
      </QueryClientProvider>
    </GoogleOAuthProvider>
  );
}
