import { useEffect, useState } from 'react';
import { Lock, Mail, Eye, EyeOff, ShieldCheck, AlertCircle, CheckCircle2 } from 'lucide-react';

// ── Types ─────────────────────────────────────────────────────────────────────

interface LoginScreenProps {
  onLogin: (user: any) => void;
}

// ── Setup Wizard (first-time only) ────────────────────────────────────────────

function SetupWizard({ onDone }: { onDone: () => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  const handleSetup = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (password.length < 8) { setError('Password must be at least 8 characters'); return; }
    if (password !== confirm) { setError('Passwords do not match'); return; }

    setLoading(true);
    try {
      const res = await fetch('/api/auth/setup-initial', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Setup failed'); return; }
      setDone(true);
      setTimeout(onDone, 2000);
    } catch {
      setError('Network error — is the server running?');
    } finally {
      setLoading(false);
    }
  };

  if (done) {
    return (
      <div className="flex flex-col items-center gap-4 text-center">
        <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center">
          <CheckCircle2 size={32} className="text-emerald-600" />
        </div>
        <h2 className="text-xl font-bold text-slate-900">Setup complete!</h2>
        <p className="text-slate-500 text-sm">Redirecting to login…</p>
      </div>
    );
  }

  return (
    <>
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center">
          <ShieldCheck size={20} className="text-white" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-slate-900">First-time Setup</h1>
          <p className="text-xs text-slate-500">Set a password for your admin account</p>
        </div>
      </div>

      <p className="text-sm text-slate-600 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 mb-6">
        Enter the <strong>email address</strong> of the first admin user already in the database, then choose a password.
        This screen disappears after first login.
      </p>

      <form onSubmit={handleSetup} className="space-y-4">
        <div className="space-y-1.5">
          <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Admin email</label>
          <div className="relative">
            <Mail size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="email"
              required
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="admin@yourcompany.com"
              className="w-full pl-9 pr-4 py-2.5 rounded-lg border border-slate-200 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none text-sm transition-all"
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">New password</label>
          <div className="relative">
            <Lock size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type={showPw ? 'text' : 'password'}
              required
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="Min. 8 characters"
              className="w-full pl-9 pr-10 py-2.5 rounded-lg border border-slate-200 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none text-sm transition-all"
            />
            <button type="button" onClick={() => setShowPw(s => !s)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
              {showPw ? <EyeOff size={15} /> : <Eye size={15} />}
            </button>
          </div>
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Confirm password</label>
          <div className="relative">
            <Lock size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type={showPw ? 'text' : 'password'}
              required
              value={confirm}
              onChange={e => setConfirm(e.target.value)}
              placeholder="Repeat password"
              className="w-full pl-9 pr-4 py-2.5 rounded-lg border border-slate-200 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none text-sm transition-all"
            />
          </div>
        </div>

        {error && (
          <div className="flex items-center gap-2 text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-sm">
            <AlertCircle size={14} />
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={loading}
          className="w-full py-2.5 bg-indigo-600 text-white rounded-lg font-bold text-sm hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg shadow-indigo-600/20"
        >
          {loading ? 'Setting up…' : 'Set Password & Continue'}
        </button>
      </form>
    </>
  );
}

// ── SSO helpers ─────────────────────────────────────────────────────────────

// Friendly messages for the ?sso=<code> query param Entra bounces back on failure.
const SSO_ERROR_MESSAGES: Record<string, string> = {
  not_authorized: "Your Microsoft account isn't authorized for this app yet. Ask an admin to map one of your Entra groups to a role.",
  failed: 'Single sign-on failed. Please try again or use email and password.',
  error: 'Something went wrong completing sign-in. Please try again.',
};

function MicrosoftLogo() {
  return (
    <svg width="16" height="16" viewBox="0 0 21 21" aria-hidden="true">
      <rect x="1" y="1" width="9" height="9" fill="#f25022" />
      <rect x="11" y="1" width="9" height="9" fill="#7fba00" />
      <rect x="1" y="11" width="9" height="9" fill="#00a4ef" />
      <rect x="11" y="11" width="9" height="9" fill="#ffb900" />
    </svg>
  );
}

// ── Login Form ────────────────────────────────────────────────────────────────

const logoBgColor = (bg: string) => (bg === 'dark' ? '#0f172a' : bg === 'none' ? 'transparent' : '#ffffff');

function LoginForm({ onLogin, samlEnabled, branding }: { onLogin: (user: any) => void; samlEnabled: boolean; branding: { siteName: string; logo: string | null; logoBg: string } }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Surface any SSO error Entra redirected back with (?sso=...), then clean the URL.
  useEffect(() => {
    const code = new URLSearchParams(window.location.search).get('sso');
    if (code && SSO_ERROR_MESSAGES[code]) {
      setError(SSO_ERROR_MESSAGES[code]);
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Login failed'); return; }
      onLogin(data.user);
    } catch (err: any) {
      console.error('Login network error:', err);
      setError(`Network error — is the server running? ${err?.message || ''}`.trim());
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <div className="flex items-center gap-3 mb-8">
        {branding.logo ? (
          <div className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 p-1.5 ${branding.logoBg === 'none' ? '' : 'ring-1 ring-black/5'}`} style={{ backgroundColor: logoBgColor(branding.logoBg) }}>
            <img src={branding.logo} alt={branding.siteName} className="max-w-full max-h-full object-contain" />
          </div>
        ) : (
          <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center font-bold text-white shadow-lg shadow-indigo-600/30 shrink-0">
            {(branding.siteName?.[0] || 'L').toUpperCase()}
          </div>
        )}
        <div>
          <h1 className="text-xl font-bold text-slate-900">{branding.siteName || 'Liquidity Reports'}</h1>
          <p className="text-xs text-slate-500">Sign in to your account</p>
        </div>
      </div>

      {samlEnabled && (
        <>
          {error && (
            <div className="flex items-center gap-2 text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-sm mb-4">
              <AlertCircle size={14} className="shrink-0" />
              {error}
            </div>
          )}
          <a
            href="/api/auth/saml/login"
            className="w-full flex items-center justify-center gap-2.5 py-2.5 rounded-lg border border-slate-300 bg-white font-semibold text-sm text-slate-700 hover:bg-slate-50 transition-all"
          >
            <MicrosoftLogo /> Sign in with Microsoft
          </a>
          <div className="flex items-center gap-3 my-5">
            <span className="flex-1 h-px bg-slate-200" />
            <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">or</span>
            <span className="flex-1 h-px bg-slate-200" />
          </div>
        </>
      )}

      <form onSubmit={handleLogin} className="space-y-4">
        <div className="space-y-1.5">
          <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Email</label>
          <div className="relative">
            <Mail size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="email"
              required
              autoFocus
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="you@company.com"
              className="w-full pl-9 pr-4 py-2.5 rounded-lg border border-slate-200 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none text-sm transition-all"
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Password</label>
          <div className="relative">
            <Lock size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type={showPw ? 'text' : 'password'}
              required
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full pl-9 pr-10 py-2.5 rounded-lg border border-slate-200 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none text-sm transition-all"
            />
            <button type="button" onClick={() => setShowPw(s => !s)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
              {showPw ? <EyeOff size={15} /> : <Eye size={15} />}
            </button>
          </div>
        </div>

        {!samlEnabled && error && (
          <div className="flex items-center gap-2 text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-sm">
            <AlertCircle size={14} />
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={loading}
          className="w-full py-2.5 bg-indigo-600 text-white rounded-lg font-bold text-sm hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg shadow-indigo-600/20 mt-2"
        >
          {loading ? 'Signing in…' : 'Sign In'}
        </button>
      </form>
    </>
  );
}

// ── Main LoginScreen ──────────────────────────────────────────────────────────

export default function LoginScreen({ onLogin }: LoginScreenProps) {
  const [mode, setMode] = useState<'checking' | 'setup' | 'login'>('checking');
  const [samlEnabled, setSamlEnabled] = useState(false);
  const [branding, setBranding] = useState<{ siteName: string; logo: string | null; logoBg: string }>({ siteName: 'Liquidity Reports', logo: null, logoBg: 'light' });

  // On mount, check whether initial setup is needed + whether SSO is configured,
  // and load the portal logo/name so the login screen matches the branding.
  useEffect(() => {
    fetch('/api/auth/setup-status')
      .then(r => r.json())
      .then(data => setMode(data.needsSetup ? 'setup' : 'login'))
      .catch((err) => {
        console.error('Setup status fetch failed:', err);
        setMode('login');
      });
    fetch('/api/auth/sso-status')
      .then(r => r.json())
      .then(data => setSamlEnabled(!!data.samlEnabled))
      .catch(() => setSamlEnabled(false));
    fetch('/api/branding/public')
      .then(r => (r.ok ? r.json() : null))
      .then(b => { if (b) setBranding({ siteName: b.siteName || 'Liquidity Reports', logo: b.logo || null, logoBg: b.logoBg || 'light' }); })
      .catch(() => {});
  }, []);

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xl p-8">
          {mode === 'checking' && (
            <div className="flex flex-col items-center gap-3 py-8">
              <div className="w-8 h-8 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
              <p className="text-slate-500 text-sm">Connecting…</p>
            </div>
          )}
          {mode === 'setup' && (
            <SetupWizard onDone={() => setMode('login')} />
          )}
          {mode === 'login' && (
            <LoginForm onLogin={onLogin} samlEnabled={samlEnabled} branding={branding} />
          )}
        </div>
      </div>
    </div>
  );
}
