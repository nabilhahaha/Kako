'use client';
import { useApp } from '@/state/app';
import { useI18n } from '@/state/i18n';
import { Icon } from '@/components/ui';

const scrollBase = {
  flex: 1, minHeight: 0, overflowY: 'auto' as const,
  animation: 'fadeUp .26s cubic-bezier(.22,1,.36,1) both',
};

export function Login() {
  const { login, nav } = useApp();
  const { tt } = useI18n();
  return (
    <div data-scroll="true" style={{ ...scrollBase, display: 'flex', flexDirection: 'column', padding: '0 26px' }}>
      <div style={{ flex: 'none', display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', paddingTop: 64 }}>
        <div style={{ width: 78, height: 78, borderRadius: 24, background: 'var(--pri)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28, fontWeight: 700, letterSpacing: '-1px', boxShadow: '0 12px 30px var(--sh)' }}>SB</div>
        <div style={{ fontSize: 23, fontWeight: 700, marginTop: 18 }}>SalesBook</div>
        <div style={{ fontSize: 13, color: 'var(--sub)', marginTop: 5 }}>{tt('الشبكة المهنية لفرق المبيعات — اعرف عميلك قبل الزيارة', 'The professional network for sales teams — know your customer before you visit')}</div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 36 }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--sub)', marginBottom: 6 }}>{tt('رقم الجوال', 'Mobile number')}</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--card)', border: '1px solid var(--bd)', borderRadius: 13, padding: '0 14px', height: 50, transition: 'border-color .2s' }}>
            <input placeholder="5X XXX XXXX" style={{ flex: 1, border: 'none', outline: 'none', background: 'transparent', fontSize: 14, color: 'var(--tx)', direction: 'ltr', textAlign: 'right' }} />
            <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--fnt)', borderInlineStart: '1px solid var(--dv)', paddingInlineStart: 10 }}>+966</span>
          </div>
        </div>
        <div>
          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--sub)', marginBottom: 6 }}>{tt('كلمة المرور', 'Password')}</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--card)', border: '1px solid var(--bd)', borderRadius: 13, padding: '0 14px', height: 50 }}>
            <input type="password" placeholder="••••••••" style={{ flex: 1, border: 'none', outline: 'none', background: 'transparent', fontSize: 14, color: 'var(--tx)' }} />
            <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--lnk)', cursor: 'pointer' }}>{tt('إظهار', 'Show')}</span>
          </div>
        </div>
        <span style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--lnk)', cursor: 'pointer', alignSelf: 'flex-start' }}>{tt('نسيت كلمة المرور؟', 'Forgot password?')}</span>
        <div onClick={login} style={{ cursor: 'pointer', height: 52, borderRadius: 14, background: 'var(--pri)', color: 'var(--onPri)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14.5, fontWeight: 700, marginTop: 6, boxShadow: '0 8px 22px var(--sh)', transition: 'transform .15s,background .2s' }}>{tt('تسجيل الدخول', 'Sign in')}</div>
        <div onClick={login} style={{ cursor: 'pointer', height: 52, borderRadius: 14, background: 'var(--card)', border: '1px solid var(--bd)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 9, fontSize: 13, fontWeight: 600, color: 'var(--tx)', transition: 'transform .15s' }}>
          <Icon name="face" size={18} stroke="var(--lnk)" />
          {tt('الدخول ببصمة الوجه', 'Sign in with Face ID')}
        </div>
      </div>
      <div style={{ marginTop: 'auto', padding: '26px 0 30px', textAlign: 'center' }}>
        <div style={{ fontSize: 12.5, color: 'var(--sub)' }}>{tt('ليس لديك حساب؟ ', 'Don’t have an account? ')}<span onClick={() => nav('register')} style={{ color: 'var(--lnk)', fontWeight: 700, cursor: 'pointer' }}>{tt('قدّم طلب عضوية', 'Request membership')}</span></div>
        <div style={{ fontSize: 10, color: 'var(--fnt)', marginTop: 10 }}>{tt('بالمتابعة أنت توافق على شروط الاستخدام وسياسة الخصوصية', 'By continuing you agree to the Terms of Use and Privacy Policy')}</div>
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
