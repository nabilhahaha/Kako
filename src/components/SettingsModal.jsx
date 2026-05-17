import { useState } from 'react';
import { useLang, useToast } from '../App.jsx';
import { getEmailConfig, setEmailConfig } from '../lib/storage.js';

export default function SettingsModal({ onClose }) {
  const { tr } = useLang();
  const { toast } = useToast();
  const [cfg, setCfg] = useState(getEmailConfig());

  const update = (k, v) => setCfg((prev) => ({ ...prev, [k]: v }));

  const save = () => {
    setEmailConfig(cfg);
    toast(tr.configSaved, 'success');
    onClose();
  };

  return (
    <div className="fixed inset-0 z-40 bg-black/40 flex items-end sm:items-center justify-center p-2 sm:p-4">
      <div className="card w-full max-w-page max-h-[90vh] overflow-y-auto fade-in">
        <div className="sticky top-0 bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between rounded-t-card">
          <h2 className="font-bold">⚙️ {tr.emailJSSettings}</h2>
          <button
            onClick={onClose}
            className="bg-gray-100 hover:bg-gray-200 rounded-full w-8 h-8 flex items-center justify-center"
            aria-label="close"
          >
            ✕
          </button>
        </div>
        <div className="p-4 space-y-3">
          <Field
            label={tr.publicKey}
            value={cfg.publicKey}
            onChange={(v) => update('publicKey', v)}
            placeholder="xxxxxxxxxxxx"
          />
          <Field
            label={tr.serviceId}
            value={cfg.serviceId}
            onChange={(v) => update('serviceId', v)}
            placeholder="service_xxxxxxx"
          />
          <Field
            label={tr.templateId}
            value={cfg.templateId}
            onChange={(v) => update('templateId', v)}
            placeholder="template_xxxxxxx"
          />
          <Field
            label={`${tr.templateId} (edit)`}
            value={cfg.templateIdEdit || ''}
            onChange={(v) => update('templateIdEdit', v)}
            placeholder="template_xxxxxxx"
          />
          <Field
            label={tr.rmEmailField}
            type="email"
            value={cfg.rmEmail}
            onChange={(v) => update('rmEmail', v)}
            placeholder="manager@roshen.com"
          />
          <Field
            label={tr.tmEmailField}
            type="email"
            value={cfg.tmEmail}
            onChange={(v) => update('tmEmail', v)}
            placeholder="tm@roshen.com"
          />
          <div className="flex gap-2 pt-2">
            <button onClick={onClose} className="btn-secondary flex-1">
              {tr.cancel}
            </button>
            <button onClick={save} className="btn-primary flex-1">
              {tr.save}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Field({ label, value, onChange, placeholder, type = 'text' }) {
  return (
    <label className="block">
      <span className="block text-xs font-semibold text-gray-600 mb-1">{label}</span>
      <input
        type={type}
        className="input-field text-sm"
        value={value || ''}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        dir="ltr"
        autoComplete="off"
      />
    </label>
  );
}
