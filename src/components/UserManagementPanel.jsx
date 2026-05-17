import { useMemo, useState } from 'react';
import { useAuth, useLang, useToast } from '../App.jsx';
import { db } from '../lib/db.js';
import { useProfiles, useAggregatedData } from '../lib/hooks.js';
import { getSalesmen } from '../lib/excel.js';

const ROLE_BADGE = {
  salesman: { bg: '#cffafe', fg: '#0e7490', labelKey: 'salesmenLabel' },
  trade_marketing: { bg: '#fef3c7', fg: '#92400e', labelKey: 'tmLabel' },
  roshen_manager: { bg: '#fee2e2', fg: '#991b1b', labelKey: 'rmLabel' },
};

export default function UserManagementPanel() {
  const { tr } = useLang();
  const { profile: me } = useAuth();
  const { data: users, loading, reload } = useProfiles();
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [resettingId, setResettingId] = useState(null);

  const sorted = useMemo(() => {
    const arr = users || [];
    return [...arr].sort((a, b) => {
      const order = { roshen_manager: 0, trade_marketing: 1, salesman: 2 };
      const r = order[a.role] - order[b.role];
      if (r !== 0) return r;
      return a.full_name.localeCompare(b.full_name);
    });
  }, [users]);

  return (
    <div className="space-y-3 fade-in">
      <button onClick={() => setShowForm(true)} className="btn-primary w-full">
        ➕ {tr.addUser}
      </button>

      {loading ? (
        <p className="text-center text-gray-400 py-12 text-sm">…</p>
      ) : sorted.length === 0 ? (
        <p className="text-center text-gray-500 py-8 text-sm">{tr.noUsers}</p>
      ) : (
        <div className="space-y-2">
          {sorted.map((u) => (
            <UserCard
              key={u.id}
              user={u}
              isMe={u.id === me.id}
              onEdit={() => setEditing(u)}
              onResetPwd={() => setResettingId(u.id)}
              onReload={reload}
            />
          ))}
        </div>
      )}

      {showForm && (
        <UserFormModal
          mode="create"
          onClose={() => setShowForm(false)}
          onDone={() => {
            setShowForm(false);
            reload();
          }}
        />
      )}
      {editing && (
        <UserFormModal
          mode="edit"
          initial={editing}
          onClose={() => setEditing(null)}
          onDone={() => {
            setEditing(null);
            reload();
          }}
        />
      )}
      {resettingId && (
        <ResetPasswordModal
          userId={resettingId}
          onClose={() => setResettingId(null)}
        />
      )}
    </div>
  );
}

/* ───────── User card row ───────── */
function UserCard({ user, isMe, onEdit, onResetPwd, onReload }) {
  const { tr } = useLang();
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const badge = ROLE_BADGE[user.role];

  const toggleActive = async () => {
    if (isMe) {
      toast('Cannot change your own active status', 'error');
      return;
    }
    if (user.is_active && !confirm(tr.confirmDeactivate)) return;
    setBusy(true);
    try {
      await db.adminUpdateUser({ id: user.id, is_active: !user.is_active });
      toast(tr.userUpdated, 'success');
      onReload();
    } catch (e) {
      toast(e.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!confirm(tr.confirmDelete)) return;
    setBusy(true);
    try {
      await db.adminDeleteUser(user.id);
      toast(tr.userDeleted, 'success');
      onReload();
    } catch (e) {
      toast(e.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={`card p-3 ${user.is_active ? '' : 'opacity-60'}`}>
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-sm">
            {user.full_name}
            {isMe && <span className="ms-2 text-[10px] text-gray-400">(you)</span>}
          </p>
          <p className="text-xs text-gray-500 truncate" dir="ltr">
            {user.email}
          </p>
          {user.salesman_name && user.role === 'salesman' && (
            <p className="text-[11px] text-cyan-700 mt-0.5 truncate">
              📂 {user.salesman_name}
            </p>
          )}
        </div>
        <span
          className="text-[10px] font-semibold px-2 py-0.5 rounded-full shrink-0"
          style={{ background: badge.bg, color: badge.fg }}
        >
          {tr[badge.labelKey]}
        </span>
      </div>
      <div className="flex flex-wrap gap-1.5">
        <button onClick={onEdit} disabled={busy} className="btn-ghost text-xs border border-gray-200">
          ✏️ {tr.edit}
        </button>
        <button onClick={onResetPwd} disabled={busy} className="btn-ghost text-xs border border-gray-200">
          🔑 {tr.resetPassword}
        </button>
        <button
          onClick={toggleActive}
          disabled={busy || isMe}
          className="btn-ghost text-xs border border-gray-200"
        >
          {user.is_active ? `⏸ ${tr.deactivate}` : `▶ ${tr.activate}`}
        </button>
        {!isMe && (
          <button
            onClick={remove}
            disabled={busy}
            className="btn-ghost text-xs border border-red-200 text-red-700"
          >
            🗑 {tr.deleteUser}
          </button>
        )}
      </div>
    </div>
  );
}

/* ───────── User form modal ───────── */
function UserFormModal({ mode, initial, onClose, onDone }) {
  const { tr } = useLang();
  const { toast } = useToast();
  const { data: agg } = useAggregatedData();
  const salesmenInExcel = useMemo(() => getSalesmen(agg?.data || {}), [agg]);

  const [fullName, setFullName] = useState(initial?.full_name || '');
  const [email, setEmail] = useState(initial?.email || '');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState(initial?.role || 'salesman');
  const [salesmanName, setSalesmanName] = useState(initial?.salesman_name || '');
  const [submitting, setSubmitting] = useState(false);

  const generatePassword = () => {
    const chars = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let s = '';
    for (let i = 0; i < 12; i++) s += chars[Math.floor(Math.random() * chars.length)];
    setPassword(s);
  };

  const save = async (e) => {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    try {
      if (mode === 'create') {
        if (!password || password.length < 6) {
          toast('Password must be ≥ 6 chars', 'error');
          return;
        }
        await db.adminCreateUser({
          email: email.trim().toLowerCase(),
          password,
          full_name: fullName.trim(),
          role,
          salesman_name: role === 'salesman' ? salesmanName.trim() : null,
        });
        toast(tr.userCreated, 'success');
      } else {
        await db.adminUpdateUser({
          id: initial.id,
          full_name: fullName.trim(),
          role,
          salesman_name: role === 'salesman' ? salesmanName.trim() : null,
          email: email.trim().toLowerCase() !== initial.email ? email.trim() : undefined,
        });
        toast(tr.userUpdated, 'success');
      }
      onDone();
    } catch (e) {
      toast(e.message, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-40 bg-black/40 flex items-end sm:items-center justify-center p-2 sm:p-4">
      <form onSubmit={save} className="card w-full max-w-page max-h-[90vh] overflow-y-auto fade-in">
        <div className="sticky top-0 bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between rounded-t-card">
          <h2 className="font-bold">{mode === 'create' ? `➕ ${tr.addUser}` : `✏️ ${tr.editUser}`}</h2>
          <button
            type="button"
            onClick={onClose}
            className="bg-gray-100 hover:bg-gray-200 rounded-full w-8 h-8 flex items-center justify-center"
            aria-label="close"
          >
            ✕
          </button>
        </div>
        <div className="p-4 space-y-3">
          <Field label={tr.fullName} value={fullName} onChange={setFullName} required autoFocus />
          <Field label={tr.email} type="email" value={email} onChange={setEmail} required dir="ltr" />

          {mode === 'create' && (
            <div>
              <label className="block">
                <span className="block text-xs font-semibold text-gray-600 mb-1">
                  {tr.password}
                </span>
                <div className="flex gap-2">
                  <input
                    type="text"
                    dir="ltr"
                    className="input-field flex-1"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    minLength={6}
                  />
                  <button
                    type="button"
                    onClick={generatePassword}
                    className="btn-secondary text-xs whitespace-nowrap"
                  >
                    🎲 {tr.generatePassword}
                  </button>
                </div>
              </label>
            </div>
          )}

          <label className="block">
            <span className="block text-xs font-semibold text-gray-600 mb-1">{tr.role}</span>
            <select
              className="input-field"
              value={role}
              onChange={(e) => setRole(e.target.value)}
            >
              <option value="salesman">{tr.salesman}</option>
              <option value="trade_marketing">{tr.tradeMarketing}</option>
              <option value="roshen_manager">{tr.roshenManager}</option>
            </select>
          </label>

          {role === 'salesman' && (
            <div>
              <label className="block">
                <span className="block text-xs font-semibold text-gray-600 mb-1">
                  {tr.salesmanNameLink}
                </span>
                <input
                  type="text"
                  list="salesman-options"
                  className="input-field"
                  value={salesmanName}
                  onChange={(e) => setSalesmanName(e.target.value)}
                  placeholder={tr.salesmanNameHint}
                />
                {salesmenInExcel.length > 0 && (
                  <datalist id="salesman-options">
                    {salesmenInExcel.map((n) => (
                      <option key={n} value={n} />
                    ))}
                  </datalist>
                )}
              </label>
              <p className="text-[11px] text-gray-500 mt-1">{tr.salesmanNameHint}</p>
            </div>
          )}

          <div className="flex gap-2 pt-2">
            <button type="button" onClick={onClose} className="btn-secondary flex-1">
              {tr.cancel}
            </button>
            <button type="submit" disabled={submitting} className="btn-primary flex-1">
              {submitting ? '...' : tr.save}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}

function ResetPasswordModal({ userId, onClose }) {
  const { tr } = useLang();
  const { toast } = useToast();
  const [pwd, setPwd] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const gen = () => {
    const chars = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let s = '';
    for (let i = 0; i < 12; i++) s += chars[Math.floor(Math.random() * chars.length)];
    setPwd(s);
  };

  const save = async (e) => {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    try {
      await db.adminResetPassword(userId, pwd);
      toast(tr.passwordReset, 'success');
      onClose();
    } catch (e) {
      toast(e.message, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-40 bg-black/40 flex items-end sm:items-center justify-center p-2 sm:p-4">
      <form onSubmit={save} className="card w-full max-w-sm fade-in">
        <div className="sticky top-0 bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between rounded-t-card">
          <h2 className="font-bold">🔑 {tr.resetPassword}</h2>
          <button
            type="button"
            onClick={onClose}
            className="bg-gray-100 hover:bg-gray-200 rounded-full w-8 h-8 flex items-center justify-center"
            aria-label="close"
          >
            ✕
          </button>
        </div>
        <div className="p-4 space-y-3">
          <label className="block">
            <span className="block text-xs font-semibold text-gray-600 mb-1">{tr.newPassword}</span>
            <div className="flex gap-2">
              <input
                type="text"
                dir="ltr"
                className="input-field flex-1"
                value={pwd}
                onChange={(e) => setPwd(e.target.value)}
                minLength={6}
                required
                autoFocus
              />
              <button
                type="button"
                onClick={gen}
                className="btn-secondary text-xs whitespace-nowrap"
              >
                🎲
              </button>
            </div>
          </label>
          <div className="flex gap-2 pt-2">
            <button type="button" onClick={onClose} className="btn-secondary flex-1">
              {tr.cancel}
            </button>
            <button type="submit" disabled={submitting} className="btn-primary flex-1">
              {submitting ? '...' : tr.save}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}

function Field({ label, value, onChange, ...rest }) {
  return (
    <label className="block">
      <span className="block text-xs font-semibold text-gray-600 mb-1">{label}</span>
      <input
        className="input-field"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        {...rest}
      />
    </label>
  );
}
