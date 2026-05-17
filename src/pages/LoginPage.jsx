import { useState } from 'react';
import { useLang, useToast } from '../App.jsx';
import { supabase } from '../lib/supabase.js';
import LanguageToggle from '../components/LanguageToggle.jsx';

export default function LoginPage() {
  const { tr } = useLang();
  const { toast } = useToast();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [forgotMode, setForgotMode] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (submitting) return;
    if (!email || !password) return;

    setSubmitting(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim().toLowerCase(),
        password,
      });
      if (error) {
        toast(tr.invalidCredentials, 'error');
      }
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
    if (!email.trim()) return;
    setSubmitting(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(
        email.trim().toLowerCase(),
        { redirectTo: window.location.origin },
      );
      if (error) {
        toast(error.message, 'error');
      } else {
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
            />
          </label>

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
              />
            </label>
          )}

          <button
            type="submit"
            disabled={submitting}
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
          v3.0 · Supabase
        </p>
      </div>
    </div>
  );
}
