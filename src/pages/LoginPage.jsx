import { useEffect, useState } from 'react';
import { useLang, useToast } from '../App.jsx';
import { supabase } from '../lib/supabase.js';
import LanguageToggle from '../components/LanguageToggle.jsx';
import LoginUserDropdown from '../components/LoginUserDropdown.jsx';

const MODE_KEY = 'login_mode_preference';

const readModePref = () => {
  try {
    const m = localStorage.getItem(MODE_KEY);
    return m === 'manual' || m === 'list' ? m : 'list';
  } catch {
    return 'list';
  }
};

const writeModePref = (m) => {
  try {
    localStorage.setItem(MODE_KEY, m);
  } catch {}
};

export default function LoginPage() {
  const { tr } = useLang();
  const { toast } = useToast();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [forgotMode, setForgotMode] = useState(false);

  // Mode: 'list' (default) | 'manual'
  const [mode, setMode] = useState(readModePref());
  const [users, setUsers] = useState([]);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [pickedUser, setPickedUser] = useState(null);

  /* ─── Fetch the user list once on mount ─── */
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const { data, error } = await supabase
          .from('profiles_login_list')
          .select('id, full_name, email, role')
          .order('full_name', { ascending: true });

        if (!active) return;

        if (error) throw error;
        if (!data || data.length === 0) {
          // Empty list — let the user fall back to typing.
          toast(tr.userListUnavailable, 'error');
          setUsers([]);
          setMode('manual');
          writeModePref('manual');
        } else {
          setUsers(data);
        }
      } catch (e) {
        console.error('profiles_login_list fetch failed:', e);
        if (!active) return;
        // Fall back gracefully — don't block manual login.
        toast(tr.userListUnavailable, 'error');
        setUsers([]);
        setMode('manual');
        writeModePref('manual');
      } finally {
        if (active) setLoadingUsers(false);
      }
    })();
    return () => {
      active = false;
    };
    // toast / tr are stable; we only want this once on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const switchMode = (m) => {
    setMode(m);
    writeModePref(m);
  };

  const handlePick = (u) => {
    setPickedUser(u);
    setEmail(u.email);
  };

  const effectiveEmail = mode === 'list' ? pickedUser?.email || '' : email;

  const submit = async (e) => {
    e.preventDefault();
    if (submitting) return;
    if (!effectiveEmail || !password) return;

    setSubmitting(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: effectiveEmail.trim().toLowerCase(),
        password,
      });
      if (error) toast(tr.invalidCredentials, 'error');
      // On success, App.jsx re-routes via auth state change.
    } catch (e) {
      console.error(e);
      toast(e.message || 'Error', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const sendReset = async (e) => {
    e.preventDefault();
    if (!effectiveEmail.trim()) return;
    setSubmitting(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(
        effectiveEmail.trim().toLowerCase(),
        { redirectTo: window.location.origin },
      );
      if (error) toast(error.message, 'error');
      else {
        toast(tr.forgotPasswordSent, 'success');
        setForgotMode(false);
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex flex-col min-h-screen">
      <div
        className="bg-gradient-to-l from-roshen-700 to-roshen-900 text-white pt-8 pb-12 px-5 relative"
        style={{ paddingTop: 'calc(env(safe-area-inset-top) + 2rem)' }}
      >
        <div className="absolute top-3 end-3">
          <LanguageToggle />
        </div>
        <div className="text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-white/15 backdrop-blur mb-3 text-3xl">
            🏷️
          </div>
          <h1 className="text-xl font-bold leading-tight">{tr.appName}</h1>
          <p className="text-xs opacity-80 mt-1">{tr.appTagline}</p>
        </div>
      </div>

      <div className="flex-1 px-4 -mt-6">
        <form
          onSubmit={forgotMode ? sendReset : submit}
          className="card p-5 space-y-3 fade-in"
        >
          <h2 className="text-center font-bold text-gray-800">
            {forgotMode ? tr.forgotPassword : tr.signIn}
          </h2>

          {/* Mode toggle (hidden in forgot-password flow) */}
          {!forgotMode && (
            <ModeToggle
              mode={mode}
              onChange={switchMode}
              listLabel={tr.modeSelectFromList}
              manualLabel={tr.modeTypeManually}
            />
          )}

          {/* Email / user picker */}
          {mode === 'list' && !forgotMode ? (
            <div className="space-y-1">
              <span className="block text-sm font-semibold text-gray-700">
                {tr.pickYourName}
              </span>
              <LoginUserDropdown
                users={users}
                loading={loadingUsers}
                selected={pickedUser}
                onSelect={handlePick}
              />
              {pickedUser && (
                <p className="text-[11px] text-gray-500 mt-1">
                  {tr.pickedAs}: <span dir="ltr" className="font-mono">{pickedUser.email}</span>
                </p>
              )}
            </div>
          ) : (
            <label className="block">
              <span className="block text-sm font-semibold text-gray-700 mb-1">
                {tr.email}
              </span>
              <input
                type="email"
                autoComplete="email"
                autoFocus
                required
                dir="ltr"
                className="input-field"
                placeholder={tr.emailPlaceholder}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                style={{ fontSize: '16px' }}
              />
            </label>
          )}

          {!forgotMode && (
            <label className="block">
              <span className="block text-sm font-semibold text-gray-700 mb-1">
                {tr.password}
              </span>
              <input
                type="password"
                autoComplete="current-password"
                required
                dir="ltr"
                className="input-field"
                placeholder={tr.enterPassword}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                style={{ fontSize: '16px' }}
              />
            </label>
          )}

          <button
            type="submit"
            disabled={
              submitting ||
              (!forgotMode && mode === 'list' && !pickedUser)
            }
            className="btn-primary w-full"
          >
            {submitting ? tr.signingIn : forgotMode ? tr.submit : tr.signIn}
          </button>

          <button
            type="button"
            onClick={() => setForgotMode((v) => !v)}
            className="btn-ghost w-full text-sm text-roshen-700"
          >
            {forgotMode ? `← ${tr.back}` : tr.forgotPassword}
          </button>
        </form>
        <p className="text-center text-[11px] text-gray-400 mt-4">
          v3.5 · Supabase
        </p>
      </div>
    </div>
  );
}

function ModeToggle({ mode, onChange, listLabel, manualLabel }) {
  const Tab = ({ value, label }) => {
    const active = mode === value;
    return (
      <button
        type="button"
        onClick={() => onChange(value)}
        className={`flex-1 py-2 text-xs font-semibold rounded-md transition ${
          active
            ? 'bg-white text-roshen-700 shadow-sm'
            : 'text-gray-500 hover:text-gray-700'
        }`}
        aria-pressed={active}
      >
        {label}
      </button>
    );
  };
  return (
    <div className="flex p-1 bg-gray-100 rounded-input gap-1">
      <Tab value="list"   label={listLabel} />
      <Tab value="manual" label={manualLabel} />
    </div>
  );
}
