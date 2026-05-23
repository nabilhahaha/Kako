import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Crown, LogIn, ChevronDown, User } from 'lucide-react';
import { useAuthStore } from '@/stores/authStore';
import { useAppStore } from '@/stores/appStore';
import { mockUsers } from '@/data/mockData';
import { homeForRole, ROLE_LABELS } from '@/lib/permissions';

export function LoginPage() {
  const navigate = useNavigate();
  const { user, setUser } = useAuthStore();
  const { addAuditLog } = useAppStore();

  const [selectedUserId, setSelectedUserId] = useState('');
  const [dropdownOpen, setDropdownOpen] = useState(false);

  useEffect(() => {
    if (user) navigate(homeForRole(user.role), { replace: true });
  }, [user, navigate]);

  const selectedUser = mockUsers.find((u) => u.id === selectedUserId) ?? null;

  const handleLogin = () => {
    if (!selectedUser) return;
    addAuditLog({
      userId: selectedUser.id,
      userName: selectedUser.fullName,
      role: selectedUser.role,
      action: 'user_login',
      entity: 'User',
      entityId: selectedUser.id,
      oldValue: '',
      newValue: 'Login',
      status: 'Success',
    });
    setUser(selectedUser);
  };

  const groupedUsers = {
    admin: mockUsers.filter((u) => u.role === 'admin'),
    manager: mockUsers.filter((u) => u.role === 'manager'),
    supervisor: mockUsers.filter((u) => u.role === 'supervisor'),
    merchandiser: mockUsers.filter((u) => u.role === 'merchandiser'),
    data_team: mockUsers.filter((u) => u.role === 'data_team'),
  };

  if (user) return null;

  return (
    <div
      className="flex min-h-screen items-center justify-center px-4 py-8"
      style={{
        background: 'linear-gradient(135deg, #2D1B69 0%, #1a0a3e 100%)',
      }}
    >
      <div
        className="pointer-events-none fixed inset-0"
        style={{
          background:
            'radial-gradient(ellipse at 50% 30%, rgba(120,80,220,0.15) 0%, transparent 70%)',
        }}
      />

      <div className="relative z-10 w-full max-w-sm">
        {/* Logo */}
        <div className="mb-6 flex flex-col items-center">
          <div
            className="mb-4 flex h-20 w-20 items-center justify-center rounded-2xl shadow-xl"
            style={{
              background:
                'linear-gradient(135deg, rgba(255,255,255,0.12) 0%, rgba(255,255,255,0.04) 100%)',
              border: '1px solid rgba(255,255,255,0.12)',
            }}
          >
            <Crown className="h-10 w-10" style={{ color: '#D4AF37' }} />
          </div>
          <h1 className="text-center text-2xl font-bold tracking-wide text-white">
            FMCG FIELD FORCE PRO
          </h1>
          <p
            className="mt-1 text-center text-sm font-medium tracking-wider"
            style={{ color: 'rgba(180,160,220,0.85)' }}
          >
            Field Execution Platform
          </p>
        </div>

        {/* Login Card */}
        <div
          className="rounded-3xl border border-white/10 p-6 shadow-2xl backdrop-blur-xl"
          style={{ background: 'rgba(255,255,255,0.06)' }}
        >
          <h2 className="mb-1 text-lg font-semibold text-white">Welcome Back</h2>
          <p className="mb-6 text-sm text-white/40">Select your account to continue</p>

          {/* User Dropdown */}
          <div className="relative mb-4">
            <label className="mb-2 block text-xs font-semibold uppercase tracking-wider text-purple-300/70">
              Select User
            </label>
            <button
              type="button"
              onClick={() => setDropdownOpen(!dropdownOpen)}
              className="flex w-full items-center justify-between rounded-xl border border-white/10 px-4 py-3.5 text-left transition-colors focus:border-purple-400/50 focus:outline-none focus:ring-1 focus:ring-purple-400/30"
              style={{ background: 'rgba(255,255,255,0.06)' }}
            >
              {selectedUser ? (
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-full bg-purple-500/30 text-sm font-bold text-white">
                    {selectedUser.fullName.split(' ').map((n) => n[0]).join('').slice(0, 2)}
                  </div>
                  <div>
                    <p className="text-sm font-medium text-white">{selectedUser.fullName}</p>
                    <p className="text-xs text-white/40">{ROLE_LABELS[selectedUser.role]} — {selectedUser.city}</p>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10">
                    <User className="h-4 w-4 text-white/40" />
                  </div>
                  <span className="text-sm text-white/40">Choose your account...</span>
                </div>
              )}
              <ChevronDown className={`h-4 w-4 text-white/40 transition-transform ${dropdownOpen ? 'rotate-180' : ''}`} />
            </button>

            {/* Dropdown List */}
            {dropdownOpen && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setDropdownOpen(false)} />
                <div
                  className="absolute left-0 right-0 z-20 mt-2 max-h-72 overflow-y-auto rounded-xl border border-white/10 py-1 shadow-2xl backdrop-blur-xl"
                  style={{ background: 'rgba(30,17,69,0.97)' }}
                >
                  {Object.entries(groupedUsers).map(([role, users]) => (
                    <div key={role}>
                      <div className="sticky top-0 px-4 py-2" style={{ background: 'rgba(30,17,69,0.97)' }}>
                        <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: '#D4AF37' }}>
                          {ROLE_LABELS[role as keyof typeof ROLE_LABELS]}
                        </p>
                      </div>
                      {users.map((u) => (
                        <button
                          key={u.id}
                          onClick={() => {
                            setSelectedUserId(u.id);
                            setDropdownOpen(false);
                          }}
                          className={`flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-white/10 ${
                            selectedUserId === u.id ? 'bg-purple-500/20' : ''
                          }`}
                        >
                          <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-purple-500/20 text-xs font-bold text-white">
                            {u.fullName.split(' ').map((n) => n[0]).join('').slice(0, 2)}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium text-white">{u.fullName}</p>
                            <p className="text-xs text-white/40">{u.city}</p>
                          </div>
                        </button>
                      ))}
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>

          {/* Selected user info */}
          {selectedUser && (
            <div className="mb-4 rounded-xl border border-purple-400/20 p-3" style={{ background: 'rgba(139,92,246,0.08)' }}>
              <div className="flex items-center justify-between text-sm">
                <span className="text-white/50">Role</span>
                <span className="font-medium text-purple-300">{ROLE_LABELS[selectedUser.role]}</span>
              </div>
              <div className="mt-1 flex items-center justify-between text-sm">
                <span className="text-white/50">City</span>
                <span className="font-medium text-white/80">{selectedUser.city}</span>
              </div>
              <div className="mt-1 flex items-center justify-between text-sm">
                <span className="text-white/50">Email</span>
                <span className="font-medium text-white/80">{selectedUser.email}</span>
              </div>
            </div>
          )}

          {/* Login Button */}
          <button
            type="button"
            disabled={!selectedUser}
            onClick={handleLogin}
            className="flex w-full items-center justify-center gap-2 rounded-xl py-4 text-sm font-bold tracking-wide text-white shadow-lg transition-all disabled:opacity-40 disabled:shadow-none"
            style={{
              background: selectedUser
                ? 'linear-gradient(135deg, #7c3aed 0%, #4c1d95 100%)'
                : 'rgba(255,255,255,0.08)',
            }}
          >
            <LogIn className="h-4 w-4" />
            Sign In
          </button>
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
