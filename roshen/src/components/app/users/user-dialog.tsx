"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Pencil, X, Copy, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createUser, updateUser } from "@/lib/users";

type Opt = { value: string; label: string };

export type UserLabels = {
  add: string; edit: string; full_name: string; email: string; role: string;
  active: string; scope: string; scope_hint: string; region: string; city: string;
  distributor: string; none: string; save: string; saving: string; create: string;
  creating: string; cancel: string; created_title: string; temp_password: string;
  temp_password_hint: string; error_generic: string;
  scope_type: string; scope_add: string; scope_clear: string; scope_required: string;
};

const inputCls =
  "w-full rounded-xl border border-line bg-white px-3 py-2 text-sm outline-none focus:border-burgundy/40 focus:ring-2 focus:ring-burgundy/15";

export function UserDialog({
  mode = "create",
  roles,
  regions,
  cities,
  distributors,
  labels,
  initial,
}: {
  mode?: "create" | "edit";
  roles: Opt[];
  regions: Opt[];
  cities: Opt[];
  distributors: Opt[];
  labels: UserLabels;
  initial?: {
    id: string; full_name: string; email: string; role: string; is_active: boolean;
    scope?: { level: string; entities: string[] };
  };
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [created, setCreated] = useState<{ email: string; pw: string } | null>(null);
  const [copied, setCopied] = useState(false);

  // create-only fields
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState(roles[0]?.value ?? "area_manager");
  const [active, setActive] = useState(true);

  // shared scope state (multi-value)
  const [scopeLevel, setScopeLevel] = useState(initial?.scope?.level ?? "");
  const [scopeValues, setScopeValues] = useState<string[]>(initial?.scope?.entities ?? []);

  function close() {
    setOpen(false); setErr(null); setCreated(null); setCopied(false);
  }

  const optsFor = (lvl: string): Opt[] => (lvl === "region" ? regions : lvl === "city" ? cities : lvl === "agent" ? distributors : []);

  async function submitCreate() {
    setErr(null);
    if (scopeLevel && scopeValues.length === 0) { setErr(labels.scope_required); return; }
    setBusy(true);
    const col = scopeLevel === "agent" ? "agent_id" : scopeLevel === "city" ? "city_id" : "region_id";
    const scopes = scopeLevel ? scopeValues.map((v) => ({ level: scopeLevel, [col]: v })) : [];
    const res = await createUser({ full_name: fullName, email, role, is_active: active, scopes });
    setBusy(false);
    if (!res.ok) { setErr(res.error ?? labels.error_generic); return; }
    setCreated({ email: res.email ?? email, pw: res.tempPassword ?? "" });
    router.refresh();
  }

  const scopeEditor = (
    <div className="space-y-2">
      <label className="text-sm font-medium text-ink">{labels.scope}</label>
      <div className="grid grid-cols-2 gap-2">
        <select
          value={scopeLevel}
          onChange={(e) => { setScopeLevel(e.target.value); setScopeValues([]); }}
          className={inputCls}
          aria-label={labels.scope_type}
        >
          <option value="">{labels.none}</option>
          <option value="region">{labels.region}</option>
          <option value="city">{labels.city}</option>
          <option value="agent">{labels.distributor}</option>
        </select>
        <select
          value=""
          disabled={!scopeLevel}
          onChange={(e) => { const v = e.target.value; if (v && !scopeValues.includes(v)) setScopeValues([...scopeValues, v]); }}
          className={inputCls + (!scopeLevel ? " opacity-60" : "")}
        >
          <option value="">{labels.scope_add}</option>
          {optsFor(scopeLevel).filter((o) => !scopeValues.includes(o.value)).map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </div>
      {scopeValues.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          {scopeValues.map((v) => {
            const lbl = optsFor(scopeLevel).find((o) => o.value === v)?.label ?? v;
            return (
              <span key={v} className="inline-flex items-center gap-1 rounded-full bg-burgundy-soft px-2.5 py-0.5 text-xs font-medium text-burgundy">
                {lbl}
                <button type="button" onClick={() => setScopeValues(scopeValues.filter((x) => x !== v))} className="hover:text-roshen-red" aria-label="Remove">
                  <X className="h-3 w-3" />
                </button>
              </span>
            );
          })}
          <button type="button" onClick={() => setScopeValues([])} className="ms-1 text-xs font-medium text-muted hover:text-roshen-red">
            {labels.scope_clear}
          </button>
        </div>
      )}
      <p className="text-xs text-muted">{labels.scope_hint}</p>
    </div>
  );

  return (
    <>
      {mode === "create" ? (
        <Button size="sm" onClick={() => setOpen(true)}><Plus className="h-4 w-4" /> {labels.add}</Button>
      ) : (
        <button onClick={() => setOpen(true)} className="rounded-lg p-1.5 text-muted hover:bg-burgundy-soft hover:text-burgundy" aria-label={labels.edit}>
          <Pencil className="h-4 w-4" />
        </button>
      )}

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-ink/40" onClick={close} />
          <div className="relative z-10 w-full max-w-md rounded-2xl border border-line bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-line px-5 py-3">
              <h3 className="font-serif text-lg font-semibold text-ink">{mode === "create" ? labels.add : labels.edit}</h3>
              <button onClick={close} className="text-muted hover:text-ink"><X className="h-4 w-4" /></button>
            </div>

            {created ? (
              <div className="space-y-3 p-5">
                <p className="text-sm font-semibold text-ink">{labels.created_title}: {created.email}</p>
                <div>
                  <label className="text-sm font-medium text-ink">{labels.temp_password}</label>
                  <div className="mt-1 flex items-center gap-2">
                    <code className="flex-1 rounded-xl border border-line bg-cream/40 px-3 py-2 text-sm">{created.pw}</code>
                    <button type="button" onClick={() => { navigator.clipboard?.writeText(created.pw); setCopied(true); }}
                      className="rounded-lg border border-line p-2 text-muted hover:bg-burgundy-soft hover:text-burgundy" aria-label="Copy">
                      {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                    </button>
                  </div>
                  <p className="mt-1 text-xs text-muted">{labels.temp_password_hint}</p>
                </div>
                <div className="flex justify-end pt-2"><Button size="sm" onClick={close}>{labels.save}</Button></div>
              </div>
            ) : mode === "edit" && initial ? (
              <form
                action={async (fd) => { await updateUser(fd); close(); router.refresh(); }}
                onSubmit={(e) => { if (scopeLevel && scopeValues.length === 0) { e.preventDefault(); setErr(labels.scope_required); } }}
                className="space-y-4 p-5"
              >
                <input type="hidden" name="id" value={initial.id} />
                {/* scope fields submitted via hidden inputs derived from state */}
                <input type="hidden" name="scope_level" value={scopeLevel} />
                {scopeValues.map((v) => <input key={v} type="hidden" name="scope_entity" value={v} />)}
                <Field label={labels.full_name}>
                  <input name="full_name" defaultValue={initial.full_name} className={inputCls} />
                </Field>
                <Field label={labels.email}>
                  <input value={initial.email} disabled className={inputCls + " opacity-70"} />
                </Field>
                <Field label={labels.role}>
                  <select name="role" defaultValue={initial.role} className={inputCls}>
                    {roles.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
                  </select>
                </Field>
                <label className="flex items-center gap-2 text-sm text-ink">
                  <input type="checkbox" name="is_active" defaultChecked={initial.is_active} className="h-4 w-4 rounded border-line" />
                  {labels.active}
                </label>
                {scopeEditor}
                {err && <p className="text-sm text-roshen-red">{err}</p>}
                <div className="flex justify-end gap-2 pt-2">
                  <Button type="button" variant="outline" size="sm" onClick={close}>{labels.cancel}</Button>
                  <Button type="submit" size="sm">{labels.save}</Button>
                </div>
              </form>
            ) : (
              <div className="space-y-4 p-5">
                <Field label={labels.full_name}>
                  <input value={fullName} onChange={(e) => setFullName(e.target.value)} className={inputCls} />
                </Field>
                <Field label={labels.email} required>
                  <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={inputCls} />
                </Field>
                <Field label={labels.role} required>
                  <select value={role} onChange={(e) => setRole(e.target.value)} className={inputCls}>
                    {roles.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
                  </select>
                </Field>
                <label className="flex items-center gap-2 text-sm text-ink">
                  <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} className="h-4 w-4 rounded border-line" />
                  {labels.active}
                </label>
                {scopeEditor}
                {err && <p className="text-sm text-roshen-red">{err}</p>}
                <div className="flex justify-end gap-2 pt-2">
                  <Button type="button" variant="outline" size="sm" onClick={close}>{labels.cancel}</Button>
                  <Button type="button" size="sm" disabled={busy || !email} onClick={submitCreate}>
                    {busy ? labels.creating : labels.create}
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="text-sm font-medium text-ink">{label}{required ? <span className="text-roshen-red"> *</span> : null}</label>
      {children}
    </div>
  );
}
