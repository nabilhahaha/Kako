import { useState } from 'react';
import { useLang, useToast } from '../App.jsx';
import LanguageToggle from '../components/LanguageToggle.jsx';

const ROLES = [
  {
    key: 'salesman',
    password: 'rep123',
    color: 'from-cyan-600 to-cyan-800',
    icon: '👤',
    labelKey: 'salesman',
  },
  {
    key: 'trade_marketing',
    password: 'tm123',
    color: 'from-amber-600 to-amber-800',
    icon: '📊',
    labelKey: 'tradeMarketing',
  },
  {
    key: 'roshen_manager',
    password: 'rm123',
    color: 'from-roshen-600 to-roshen-800',
    icon: '🏢',
    labelKey: 'roshenManager',
  },
];

export default function LoginPage({ onLogin }) {
  const { tr } = useLang();
  const { toast } = useToast();
  const [selectedRole, setSelectedRole] = useState(null);
  const [password, setPassword] = useState('');

  const role = selectedRole ? ROLES.find((r) => r.key === selectedRole) : null;

  const submit = (e) => {
    e?.preventDefault();
    if (!role) return;
    if (password.trim() !== role.password) {
      toast(tr.wrongPassword, 'error');
      return;
    }
    onLogin(role.key);
  };

  return (
    <div className="flex flex-col min-h-screen">
      <div className="bg-gradient-to-l from-roshen-700 to-roshen-900 text-white pt-8 pb-12 px-5 relative" style={{ paddingTop: 'calc(env(safe-area-inset-top) + 2rem)' }}>
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
        <div className="card p-4 fade-in">
          {!role ? (
            <>
              <h2 className="text-center font-bold text-gray-700 mb-4">{tr.selectRole}</h2>
              <div className="space-y-2.5">
                {ROLES.map((r) => (
                  <button
                    key={r.key}
                    onClick={() => setSelectedRole(r.key)}
                    className={`w-full bg-gradient-to-l ${r.color} text-white rounded-input px-4 py-4 flex items-center gap-3 active:scale-[0.98] transition shadow-sm hover:shadow-md`}
                  >
                    <span className="text-2xl">{r.icon}</span>
                    <span className="font-semibold text-base flex-1 text-start">
                      {tr[r.labelKey]}
                    </span>
                    <span className="opacity-70 rtl-only">←</span>
                    <span className="opacity-70 ltr-only">→</span>
                  </button>
                ))}
              </div>
            </>
          ) : (
            <form onSubmit={submit} className="space-y-3">
              <button
                type="button"
                onClick={() => {
                  setSelectedRole(null);
                  setPassword('');
                }}
                className="btn-ghost text-sm"
              >
                ← {tr.back}
              </button>
              <div className="text-center py-3">
                <div className="text-4xl mb-1">{role.icon}</div>
                <h2 className="font-bold">{tr[role.labelKey]}</h2>
              </div>
              <label className="block">
                <span className="block text-sm font-semibold text-gray-700 mb-1">
                  {tr.password}
                </span>
                <input
                  type="password"
                  autoFocus
                  className="input-field"
                  placeholder={tr.enterPassword}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  dir="ltr"
                />
              </label>
              <button type="submit" className="btn-primary w-full">
                {tr.login}
              </button>
            </form>
          )}
        </div>
        <p className="text-center text-[11px] text-gray-400 mt-4">v2.0 · localStorage edition</p>
      </div>
    </div>
  );
}
