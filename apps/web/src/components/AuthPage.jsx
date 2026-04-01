import { GoogleLogin } from '@react-oauth/google';
import { useAuthStore } from '../stores/authStore';

export default function AuthPage({ inviteEmail = null }) {
  const { loginWithGoogle } = useAuthStore();

  const handleSuccess = async (response) => {
    try {
      await loginWithGoogle(response.credential);
    } catch (err) {
      alert(err.response?.data?.error || '로그인에 실패했습니다');
    }
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f5f5f5' }}>
      <div style={{ background: '#fff', borderRadius: 12, padding: '2.5rem', width: 360, boxShadow: '0 2px 16px rgba(0,0,0,0.08)', textAlign: 'center' }}>
        <h1 style={{ fontSize: 22, fontWeight: 600, marginBottom: 8 }}>GreedySign</h1>
        <p style={{ color: '#6b7280', marginBottom: inviteEmail ? 16 : 32, fontSize: 14 }}>PDF 서명 수집 서비스</p>

        {inviteEmail && (
          <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 8, padding: '10px 14px', marginBottom: 24, fontSize: 13, color: '#1e40af' }}>
            <strong>{inviteEmail}</strong> 계정으로 로그인해주세요
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'center' }}>
          <GoogleLogin
            onSuccess={handleSuccess}
            onError={() => alert('구글 로그인에 실패했습니다')}
            useOneTap={!inviteEmail}
            login_hint={inviteEmail || undefined}
            locale="ko"
          />
        </div>
      </div>
    </div>
  );
}
