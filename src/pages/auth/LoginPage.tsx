import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Shield,
  Briefcase,
  Users,
  ShoppingCart,
  Database,
  Crown,
  Eye,
  EyeOff,
} from 'lucide-react';
import { useAuthStore } from '@/stores/authStore';
import { useAppStore } from '@/stores/appStore';
import { mockUsers, roleCredentials } from '@/data/mockData';
import { homeForRole } from '@/lib/permissions';
import type { UserRole } from '@/lib/types';

/* ------------------------------------------------------------------ */
/*  Role definitions                                                   */
/* ------------------------------------------------------------------ */

const roles: {
  key: string;
  role: UserRole;
  label: string;
  description: string;
  icon: React.ReactNode;
}[] = [
  {
    key: 'admin',
    role: 'admin',
    label: 'Admin',
    description: 'Full system access',
    icon: <Shield className="h-6 w-6" />,
  },
  {
    key: 'manager',
    role: 'manager',
    label: 'Manager',
    description: 'Team oversight',
    icon: <Briefcase className="h-6 w-6" />,
  },
  {
    key: 'supervisor',
    role: 'supervisor',
    label: 'Supervisor',
    description: 'Field management',
    icon: <Users className="h-6 w-6" />,
  },
  {
    key: 'merchandiser',
    role: 'merchandiser',
    label: 'Merchandiser',
    description: 'Store execution',
    icon: <ShoppingCart className="h-6 w-6" />,
  },
  {
    key: 'data_team',
    role: 'data_team',
    label: 'Data Team',
    description: 'Data management',
    icon: <Database className="h-6 w-6" />,
  },
];

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export function LoginPage() {
  const navigate = useNavigate();
  const { user, setUser } = useAuthStore();
  const { addAuditLog } = useAppStore();

  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    if (user) navigate(homeForRole(user.role), { replace: true });
  }, [user, navigate]);

  const handleLogin = (roleKey: string) => {
    const cred = roleCredentials[roleKey];
    const mockUser = mockUsers.find((u) => u.username === cred.username);
    if (!mockUser) return;

    addAuditLog({
      userId: mockUser.id,
      userName: mockUser.fullName,
      role: mockUser.role,
      action: 'user_login',
      entity: 'User',
      entityId: mockUser.id,
      oldValue: '',
      newValue: 'Login',
      status: 'Success',
    });

    setUser(mockUser);
  };

  if (user) return null;

  return (
    <div
      className="flex min-h-screen items-center justify-center p-4"
      style={{
        background: 'linear-gradient(135deg, #2D1B69 0%, #1a0a3e 100%)',
      }}
    >
      {/* Subtle radial glow */}
      <div
        className="pointer-events-none fixed inset-0"
        style={{
          background:
            'radial-gradient(ellipse at 50% 30%, rgba(120,80,220,0.15) 0%, transparent 70%)',
        }}
      />

      <div className="relative z-10 w-full max-w-md">
        {/* ---- Main Card ---- */}
        <div
          className="rounded-3xl border border-white/10 p-8 shadow-2xl backdrop-blur-xl"
          style={{ background: 'rgba(255,255,255,0.06)' }}
        >
          {/* Crown icon */}
          <div className="mb-4 flex justify-center">
            <div
              className="flex h-16 w-16 items-center justify-center rounded-2xl shadow-lg"
              style={{
                background:
                  'linear-gradient(135deg, rgba(255,255,255,0.12) 0%, rgba(255,255,255,0.04) 100%)',
                border: '1px solid rgba(255,255,255,0.12)',
              }}
            >
              <Crown className="h-8 w-8" style={{ color: '#D4AF37' }} />
            </div>
          </div>

          {/* App name */}
          <h1 className="mb-1 text-center text-2xl font-bold tracking-wide text-white">
            FMCG FIELD FORCE PRO
          </h1>
          <p
            className="mb-8 text-center text-sm font-medium tracking-wider"
            style={{ color: 'rgba(180,160,220,0.85)' }}
          >
            Field Execution Platform
          </p>

          {/* ---- Form fields (decorative) ---- */}
          <div className="space-y-4">
            {/* Company Code */}
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-purple-300/70">
                Company Code
              </label>
              <input
                type="text"
                disabled
                value="DEMO"
                className="w-full rounded-xl border border-white/10 px-4 py-3 text-sm font-medium text-white/50 backdrop-blur-sm focus:outline-none disabled:cursor-not-allowed"
                style={{ background: 'rgba(255,255,255,0.06)' }}
              />
            </div>

            {/* Email */}
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-purple-300/70">
                Email
              </label>
              <input
                type="email"
                placeholder="Enter your email"
                className="w-full rounded-xl border border-white/10 px-4 py-3 text-sm text-white placeholder-white/30 backdrop-blur-sm transition-colors focus:border-purple-400/50 focus:outline-none focus:ring-1 focus:ring-purple-400/30"
                style={{ background: 'rgba(255,255,255,0.06)' }}
              />
            </div>

            {/* Password */}
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-purple-300/70">
                Password
              </label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Enter your password"
                  className="w-full rounded-xl border border-white/10 px-4 py-3 pr-11 text-sm text-white placeholder-white/30 backdrop-blur-sm transition-colors focus:border-purple-400/50 focus:outline-none focus:ring-1 focus:ring-purple-400/30"
                  style={{ background: 'rgba(255,255,255,0.06)' }}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 transition-colors hover:text-white/70"
                >
                  {showPassword ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              </div>
            </div>
          </div>

          {/* Remember me / Forgot password */}
          <div className="mt-4 flex items-center justify-between">
            <label className="flex cursor-pointer items-center gap-2">
              <input
                type="checkbox"
                className="h-3.5 w-3.5 rounded border-white/20 bg-white/10 text-purple-500 focus:ring-purple-400/30"
              />
              <span className="text-xs text-white/50">Remember me</span>
            </label>
            <button
              type="button"
              className="text-xs text-purple-300/60 transition-colors hover:text-purple-300"
            >
              Forgot password?
            </button>
          </div>

          {/* Login button (decorative) */}
          <button
            type="button"
            className="mt-6 w-full rounded-xl py-3.5 text-sm font-bold tracking-wide text-white shadow-lg transition-all hover:shadow-purple-500/25"
            style={{
              background: 'linear-gradient(135deg, #7c3aed 0%, #4c1d95 100%)',
            }}
          >
            Sign In
          </button>

          {/* Divider */}
          <div className="my-6 flex items-center gap-3">
            <div className="h-px flex-1 bg-white/10" />
            <span className="text-[11px] font-medium uppercase tracking-widest text-white/30">
              Or select a role
            </span>
            <div className="h-px flex-1 bg-white/10" />
          </div>

          {/* ---- Role selection grid ---- */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {roles.map((r) => (
              <button
                key={r.key}
                onClick={() => handleLogin(r.key)}
                className="group flex flex-col items-center gap-2 rounded-xl border border-white/8 p-4 text-center backdrop-blur-sm transition-all duration-200 hover:scale-[1.05] hover:brightness-125 focus:outline-none focus:ring-2 focus:ring-purple-400/40"
                style={{ background: 'rgba(255,255,255,0.05)' }}
              >
                <div
                  className="flex h-10 w-10 items-center justify-center rounded-lg transition-transform duration-200 group-hover:scale-110"
                  style={{ color: '#D4AF37' }}
                >
                  {r.icon}
                </div>
                <span className="text-xs font-semibold text-white">
                  {r.label}
                </span>
                <span className="text-[10px] leading-tight text-white/40">
                  {r.description}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* Footer */}
        <p
          className="mt-6 text-center text-[11px] font-medium tracking-wider"
          style={{ color: 'rgba(180,160,220,0.4)' }}
        >
          Powered by FMCG Pro Platform
        </p>
      </div>
    </div>
  );
}
