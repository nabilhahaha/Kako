'use client';
import { useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { Eye, EyeOff, ScanFace, Fingerprint, Loader2, BookOpenCheck, AlertCircle } from 'lucide-react';
import { useApp } from '@/state/app';
import { useI18n } from '@/state/i18n';
import { Icon, Toggle } from '@/components/ui';

const scrollBase = {
  flex: 1, minHeight: 0, overflowY: 'auto' as const,
  animation: 'fadeUp .26s cubic-bezier(.22,1,.36,1) both',
};

const COUNTRIES = [
  { code: '+966', ar: 'السعودية', en: 'Saudi Arabia' },
  { code: '+971', ar: 'الإمارات', en: 'UAE' },
  { code: '+965', ar: 'الكويت', en: 'Kuwait' },
  { code: '+974', ar: 'قطر', en: 'Qatar' },
  { code: '+973', ar: 'البحرين', en: 'Bahrain' },
  { code: '+968', ar: 'عُمان', en: 'Oman' },
  { code: '+20', ar: 'مصر', en: 'Egypt' },
  { code: '+962', ar: 'الأردن', en: 'Jordan' },
];

/* Animated form field: focus glow, error state, optional trailing control. */
function LoginField({ label, error, focused, children }: {
  label: string; error?: boolean; focused: boolean; children: React.ReactNode;
}) {
  return (
    <div>
      <div style={{ fontSize: 11.5, fontWeight: 600, color: error ? 'var(--red)' : focused ? 'var(--pri)' : 'var(--sub)', marginBottom: 6, transition: 'color .2s' }}>{label}</div>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8, background: 'var(--card)',
        border: `1.5px solid ${error ? 'var(--red)' : focused ? 'var(--pri)' : 'var(--bd)'}`,
        borderRadius: 16, padding: '0 14px', height: 54,
        boxShadow: focused ? '0 0 0 4px var(--priT)' : 'var(--shadow-sm)',
        transition: 'border-color .2s, box-shadow .2s',
      }}>
        {children}
      </div>
    </div>
  );
}

export function Login() {
  const { login, nav, toast } = useApp();
  const { tt, lang } = useI18n();
  const [country, setCountry] = useState('+966');
  const [phone, setPhone] = useState('');
  const [pass, setPass] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [remember, setRemember] = useState(true);
  const [focus, setFocus] = useState<'phone' | 'pass' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const submit = () => {
    if (busy) return;
    const digits = phone.replace(/\D/g, '');
    if (digits.length < 7) { setError(tt('أدخل رقم جوال صحيحًا', 'Enter a valid mobile number')); return; }
    if (!pass) { setError(tt('أدخل كلمة المرور', 'Enter your password')); return; }
    setError(null);
    setBusy(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => login(), 900);
  };
  const biometric = (kind: 'face' | 'touch') => {
    if (busy) return;
    setBusy(true);
    toast(kind === 'face' ? { ar: 'تم التحقق ببصمة الوجه', en: 'Verified with Face ID' } : { ar: 'تم التحقق بالبصمة', en: 'Verified with fingerprint' });
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => login(), 700);
  };

  return (
    <div data-scroll="true" style={{ ...scrollBase, display: 'flex', flexDirection: 'column', padding: '0 24px' }}>
      {/* brand */}
      <motion.div
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
        style={{ flex: 'none', display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', paddingTop: 'max(48px, 9vh)' }}>
        <div style={{ width: 84, height: 84, borderRadius: 26, background: 'linear-gradient(135deg, var(--pri) 0%, var(--acc) 100%)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: 'var(--shadow-lg)' }}>
          <BookOpenCheck size={38} strokeWidth={1.8} aria-hidden />
        </div>
        <div style={{ fontSize: 25, fontWeight: 700, marginTop: 18, letterSpacing: '-0.5px' }}>{tt('أهلًا بك في SalesBook', 'Welcome to SalesBook')}</div>
        <div style={{ fontSize: 13, color: 'var(--sub)', marginTop: 6, lineHeight: 1.7, maxWidth: 320 }}>{tt('منصة ذكاء العملاء لفرق المبيعات — اعرف عميلك قبل الزيارة', 'Customer intelligence for sales teams — know your customer before you visit')}</div>
      </motion.div>

      {/* form */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1, duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
        style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 32, animation: error ? 'shake .4s' : undefined }}
        key={error ? `err-${error}` : 'ok'}>
        <LoginField label={tt('رقم الجوال', 'Mobile number')} focused={focus === 'phone'} error={!!error && phone.replace(/\D/g, '').length < 7}>
          <input
            inputMode="tel" autoComplete="tel" placeholder="5X XXX XXXX" value={phone}
            onChange={(e) => setPhone(e.target.value)}
            onFocus={() => setFocus('phone')} onBlur={() => setFocus(null)}
            aria-label={tt('رقم الجوال', 'Mobile number')}
            style={{ flex: 1, minWidth: 0, border: 'none', outline: 'none', background: 'transparent', fontSize: 15, color: 'var(--tx)', direction: 'ltr', textAlign: lang === 'ar' ? 'right' : 'left' }}
          />
          <select
            value={country} onChange={(e) => setCountry(e.target.value)}
            aria-label={tt('الدولة', 'Country')}
            style={{ border: 'none', outline: 'none', background: 'transparent', fontSize: 13, fontWeight: 600, color: 'var(--sub)', cursor: 'pointer', borderInlineStart: '1px solid var(--dv)', paddingInlineStart: 10, direction: 'ltr' }}>
            {COUNTRIES.map((c) => <option key={c.code} value={c.code}>{c.code} {lang === 'ar' ? c.ar : c.en}</option>)}
          </select>
        </LoginField>

        <LoginField label={tt('كلمة المرور', 'Password')} focused={focus === 'pass'} error={!!error && !pass}>
          <input
            type={showPass ? 'text' : 'password'} autoComplete="current-password" placeholder="••••••••" value={pass}
            onChange={(e) => setPass(e.target.value)}
            onFocus={() => setFocus('pass')} onBlur={() => setFocus(null)}
            onKeyDown={(e) => { if (e.key === 'Enter') submit(); }}
            aria-label={tt('كلمة المرور', 'Password')}
            style={{ flex: 1, minWidth: 0, border: 'none', outline: 'none', background: 'transparent', fontSize: 15, color: 'var(--tx)' }}
          />
          <button onClick={() => setShowPass((v) => !v)} aria-label={showPass ? tt('إخفاء كلمة المرور', 'Hide password') : tt('إظهار كلمة المرور', 'Show password')} style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--fnt)', display: 'flex', padding: 4 }}>
            {showPass ? <EyeOff size={18} aria-hidden /> : <Eye size={18} aria-hidden />}
          </button>
        </LoginField>

        {error && (
          <div role="alert" style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12, fontWeight: 600, color: 'var(--red)', animation: 'fadeUp .2s both' }}>
            <AlertCircle size={14} aria-hidden /> {error}
          </div>
        )}

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 9, cursor: 'pointer', fontSize: 12, fontWeight: 600, color: 'var(--sub)' }}>
            <Toggle on={remember} onToggle={() => setRemember((v) => !v)} label={tt('تذكرني', 'Remember me')} />
            {tt('تذكرني', 'Remember me')}
          </label>
          <button onClick={() => toast({ ar: 'أُرسل رابط الاستعادة إلى جوالك', en: 'A reset link was sent to your phone' })} style={{ border: 'none', background: 'transparent', cursor: 'pointer', fontSize: 12, fontWeight: 700, color: 'var(--lnk)', padding: 4 }}>{tt('نسيت كلمة المرور؟', 'Forgot password?')}</button>
        </div>

        <motion.button
          onClick={submit}
          whileTap={{ scale: 0.98 }}
          disabled={busy}
          style={{ border: 'none', cursor: 'pointer', height: 54, borderRadius: 16, background: 'var(--pri)', color: 'var(--onPri)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 9, fontSize: 15, fontWeight: 700, marginTop: 4, boxShadow: '0 10px 26px var(--priT), var(--shadow-md)', opacity: busy ? 0.85 : 1, transition: 'opacity .2s' }}>
          {busy && <Loader2 size={18} style={{ animation: 'spin 1s linear infinite' }} aria-hidden />}
          {busy ? tt('جارٍ تسجيل الدخول…', 'Signing in…') : tt('تسجيل الدخول', 'Sign in')}
        </motion.button>

        {/* divider */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '4px 0' }}>
          <span style={{ flex: 1, height: 1, background: 'var(--dv)' }} />
          <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--fnt)' }}>{tt('أو', 'or')}</span>
          <span style={{ flex: 1, height: 1, background: 'var(--dv)' }} />
        </div>

        {/* biometric sign-in */}
        <div style={{ display: 'flex', gap: 10 }}>
          <motion.button whileTap={{ scale: 0.97 }} onClick={() => biometric('face')} style={{ flex: 1, border: '1px solid var(--bd)', cursor: 'pointer', height: 52, borderRadius: 16, background: 'var(--card)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 9, fontSize: 13, fontWeight: 600, color: 'var(--tx)', boxShadow: 'var(--shadow-sm)' }}>
            <ScanFace size={19} color="var(--pri)" strokeWidth={1.9} aria-hidden />
            {tt('بصمة الوجه', 'Face ID')}
          </motion.button>
          <motion.button whileTap={{ scale: 0.97 }} onClick={() => biometric('touch')} style={{ flex: 1, border: '1px solid var(--bd)', cursor: 'pointer', height: 52, borderRadius: 16, background: 'var(--card)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 9, fontSize: 13, fontWeight: 600, color: 'var(--tx)', boxShadow: 'var(--shadow-sm)' }}>
            <Fingerprint size={19} color="var(--pri)" strokeWidth={1.9} aria-hidden />
            {tt('البصمة', 'Fingerprint')}
          </motion.button>
        </div>
      </motion.div>

      <div style={{ marginTop: 'auto', padding: '26px 0 28px', textAlign: 'center' }}>
        <div style={{ fontSize: 12.5, color: 'var(--sub)' }}>{tt('ليس لديك حساب؟ ', 'Don’t have an account? ')}<span onClick={() => nav('register')} style={{ color: 'var(--lnk)', fontWeight: 700, cursor: 'pointer' }}>{tt('قدّم طلب عضوية', 'Request membership')}</span></div>
        <div style={{ fontSize: 10.5, color: 'var(--fnt)', marginTop: 10 }}>{tt('بالمتابعة أنت توافق على شروط الاستخدام وسياسة الخصوصية', 'By continuing you agree to the Terms of Use and Privacy Policy')}</div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--sub)', marginBottom: 5 }}>{label}</div>
      {children}
    </div>
  );
}
const inputStyle = { width: '100%', boxSizing: 'border-box' as const, height: 48, background: 'var(--card)', border: '1px solid var(--bd)', borderRadius: 12, padding: '0 14px', fontSize: 13.5, color: 'var(--tx)', outline: 'none' };

export function Register() {
  const { root, set } = useApp();
  const { tt } = useI18n();
  return (
    <div data-scroll="true" style={{ ...scrollBase, padding: '0 22px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0 4px' }}>
        <span onClick={() => root('login')} style={{ cursor: 'pointer', width: 36, height: 36, borderRadius: 12, background: 'var(--card)', border: '1px solid var(--bd)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icon name="back" size={16} stroke="var(--tx)" sw={2} /></span>
        <div>
          <div style={{ fontSize: 17, fontWeight: 700 }}>{tt('طلب عضوية جديد', 'New membership request')}</div>
          <div style={{ fontSize: 11, color: 'var(--sub)', marginTop: 1 }}>{tt('تتم مراجعة الطلبات من المسؤول خلال 24 ساعة', 'Requests are reviewed by an admin within 24 hours')}</div>
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 16, background: 'var(--card)', border: '1px solid var(--bd)', borderRadius: 16, padding: 14 }}>
        <div style={{ width: 64, height: 64, flex: 'none', borderRadius: '50%', border: '1.5px dashed var(--fnt)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2, cursor: 'pointer' }}>
          <Icon name="camera" size={18} stroke="var(--fnt)" />
        </div>
        <div>
          <div style={{ fontSize: 13, fontWeight: 700 }}>{tt('صورة الملف الشخصي', 'Profile photo')}</div>
          <div style={{ fontSize: 11, color: 'var(--sub)', marginTop: 2 }}>{tt('إلزامية — تساعد فريقك على التعرف عليك', 'Required — helps your team recognize you')}</div>
          <span style={{ display: 'inline-block', marginTop: 6, fontSize: 11, fontWeight: 700, color: 'var(--lnk)', cursor: 'pointer' }}>{tt('التقاط صورة', 'Take photo')}</span>
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 11, marginTop: 14 }}>
        <Field label={tt('الاسم الكامل', 'Full name')}><input placeholder={tt('مثال: عبدالعزيز الغامدي', 'e.g. Abdulaziz Al-Ghamdi')} style={inputStyle} /></Field>
        <Field label={tt('رقم الجوال', 'Mobile number')}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--card)', border: '1px solid var(--bd)', borderRadius: 12, padding: '0 14px', height: 48 }}>
            <input placeholder="5X XXX XXXX" style={{ flex: 1, border: 'none', outline: 'none', background: 'transparent', fontSize: 13.5, color: 'var(--tx)', direction: 'ltr', textAlign: 'right' }} />
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--fnt)' }}>+966</span>
          </div>
        </Field>
        <div style={{ display: 'flex', gap: 10 }}>
          <div style={{ flex: 1 }}><Field label={tt('اسم الشركة', 'Company name')}><input placeholder={tt('شركة التوزيع…', 'Distribution Co…')} style={inputStyle} /></Field></div>
          <div style={{ flex: 1 }}><Field label={tt('المسمى الوظيفي', 'Job title')}><input placeholder={tt('مندوب مبيعات', 'Sales Rep')} style={inputStyle} /></Field></div>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <div style={{ flex: 1 }}><Field label={tt('الدولة', 'Country')}><div style={{ height: 48, background: 'var(--card)', border: '1px solid var(--bd)', borderRadius: 12, padding: '0 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }}><span style={{ fontSize: 13.5 }}>{tt('السعودية', 'Saudi Arabia')}</span><Icon name="chevronDown" size={14} stroke="var(--fnt)" sw={2} /></div></Field></div>
          <div style={{ flex: 1 }}><Field label={tt('المدينة', 'City')}><div style={{ height: 48, background: 'var(--card)', border: '1px solid var(--bd)', borderRadius: 12, padding: '0 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }}><span style={{ fontSize: 13.5 }}>{tt('الرياض', 'Riyadh')}</span><Icon name="chevronDown" size={14} stroke="var(--fnt)" sw={2} /></div></Field></div>
        </div>
        <Field label={tt('البريد الإلكتروني (اختياري)', 'Email (optional)')}><input placeholder="name@company.com" style={{ ...inputStyle, direction: 'ltr', textAlign: 'right' }} /></Field>
        <Field label={tt('كلمة المرور', 'Password')}><input type="password" placeholder={tt('8 أحرف على الأقل', 'At least 8 characters')} style={inputStyle} /></Field>
      </div>
      <div onClick={() => { fetch('/api/auth/register', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' }).catch(() => {}); set({ screen: 'pending', stack: [] }); }} style={{ cursor: 'pointer', height: 52, borderRadius: 14, background: 'var(--pri)', color: 'var(--onPri)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14.5, fontWeight: 700, margin: '18px 0 10px', boxShadow: '0 8px 22px var(--sh)' }}>{tt('إرسال طلب العضوية', 'Submit membership request')}</div>
      <div style={{ textAlign: 'center', fontSize: 11, color: 'var(--fnt)', paddingBottom: 26 }}>{tt('سيصلك إشعار فور اعتماد حسابك', 'You’ll be notified as soon as your account is approved')}</div>
    </div>
  );
}

export function Pending() {
  const { root } = useApp();
  const { tt } = useI18n();
  return (
    <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: '0 34px', animation: 'fadeUp .26s cubic-bezier(.22,1,.36,1) both' }}>
      <div style={{ position: 'relative', width: 92, height: 92 }}>
        <span style={{ position: 'absolute', inset: 0, borderRadius: '50%', background: 'var(--ambT)', animation: 'pulseSoft 2.2s infinite' }} />
        <span style={{ position: 'absolute', inset: 8, borderRadius: '50%', background: 'var(--ambT)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="clock" size={30} stroke="var(--amb)" sw={1.9} />
        </span>
      </div>
      <div style={{ fontSize: 19, fontWeight: 700, marginTop: 22 }}>{tt('تم إرسال طلبك بنجاح', 'Your request was submitted successfully')}</div>
      <div style={{ fontSize: 13, color: 'var(--sub)', lineHeight: 1.8, marginTop: 8 }}>{tt('حسابك بانتظار اعتماد المسؤول.', 'Your account is awaiting admin approval.')}<br />{tt('سيصلك إشعار فور مراجعة الطلب — عادةً خلال 24 ساعة.', 'You’ll be notified once it’s reviewed — usually within 24 hours.')}</div>
      <span style={{ marginTop: 16, fontSize: 12, fontWeight: 700, color: 'var(--ambTx)', background: 'var(--ambT)', borderRadius: 99, padding: '7px 16px' }}>● {tt('قيد الاعتماد', 'Pending approval')}</span>
      <div style={{ marginTop: 26, width: '100%', background: 'var(--card)', border: '1px solid var(--bd)', borderRadius: 16, padding: '13px 16px', display: 'flex', alignItems: 'center', gap: 12, textAlign: 'start' }}>
        <div style={{ width: 42, height: 42, flex: 'none', borderRadius: '50%', background: 'var(--chip)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700, color: 'var(--sub)' }}>عغ</div>
        <div style={{ flex: 1 }}><div style={{ fontSize: 13, fontWeight: 700 }}>{tt('عبدالعزيز الغامدي', 'Abdulaziz Al-Ghamdi')}</div><div style={{ fontSize: 11, color: 'var(--sub)', marginTop: 2 }}>{tt('مندوب مبيعات · شركة التوزيع الوطنية · الرياض', 'Sales Rep · National Distribution Co. · Riyadh')}</div></div>
        <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--lnk)', cursor: 'pointer' }}>{tt('تعديل', 'Edit')}</span>
      </div>
      <div onClick={() => root('login')} style={{ cursor: 'pointer', marginTop: 14, height: 48, width: '100%', borderRadius: 13, background: 'var(--card)', border: '1px solid var(--bd)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700, color: 'var(--tx)' }}>{tt('العودة لتسجيل الدخول', 'Back to sign in')}</div>
    </div>
  );
}
