'use client';
import { useApp } from '@/state/app';
import { useI18n } from '@/state/i18n';
import { Icon, Toggle } from '@/components/ui';

export function Settings() {
  const { s, set, back, toggleTheme } = useApp();
  const { tt, lang, toggleLang } = useI18n();

  const sectionLabel = { fontSize: 11, fontWeight: 700, color: 'var(--fnt)' } as const;
  const card = { background: 'var(--card)', border: '1px solid var(--bd)', borderRadius: 16, marginTop: 8, overflow: 'hidden' } as const;
  const row = { display: 'flex', alignItems: 'center', gap: 11, padding: '13px 15px' } as const;
  const rowBd = { ...row, borderBottom: '1px solid var(--dv)' } as const;

  return (
    <div data-scroll="true" style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '0 20px', animation: 'fadeUp .26s cubic-bezier(.22,1,.36,1) both' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0 4px' }}>
        <span onClick={back} style={{ cursor: 'pointer', width: 36, height: 36, borderRadius: 12, background: 'var(--card)', border: '1px solid var(--bd)', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'transform .15s' }}><Icon name="back" size={16} stroke="var(--tx)" sw={2} /></span>
        <div style={{ fontSize: 17, fontWeight: 700 }}>{tt('الإعدادات', 'Settings')}</div>
      </div>

      <div style={{ ...sectionLabel, marginTop: 14 }}>{tt('المظهر', 'Appearance')}</div>
      <div style={card}>
        <div style={rowBd}>
          <span style={{ flex: 1, fontSize: 13, fontWeight: 600 }}>{tt('الوضع الداكن', 'Dark mode')}</span>
          <Toggle on={s.theme === 'dark'} onToggle={toggleTheme} />
        </div>
        <div style={row}>
          <span style={{ flex: 1, fontSize: 13, fontWeight: 600 }}>{tt('اللغة', 'Language')}</span>
          <span style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--tx)' }}>{lang === 'ar' ? 'العربية' : 'English'}</span>
          <span onClick={toggleLang} style={{ cursor: 'pointer', fontSize: 10, fontWeight: 700, color: 'var(--lnk)', background: 'var(--priT)', borderRadius: 99, padding: '3px 9px' }}>{lang === 'ar' ? 'English' : 'العربية'}</span>
        </div>
      </div>

      <div style={{ ...sectionLabel, marginTop: 16 }}>{tt('العمل الميداني', 'Field work')}</div>
      <div style={card}>
        <div style={rowBd}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 600 }}>{tt('وضع عدم الاتصال', 'Offline mode')}</div>
            <div style={{ fontSize: 10, color: 'var(--sub)', marginTop: 2 }}>{tt('تصفح واكتب التقارير بلا إنترنت — تُزامن تلقائيًا', 'Browse and write reports offline — syncs automatically')}</div>
          </div>
          <Toggle on={s.offline} onToggle={() => set({ offline: !s.offline })} />
        </div>
        <div style={row}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 600 }}>{tt('الدخول ببصمة الوجه', 'Sign in with Face ID')}</div>
          </div>
          <Toggle on={s.ntf1} onToggle={() => set({ ntf1: !s.ntf1 })} />
        </div>
      </div>

      <div style={{ ...sectionLabel, marginTop: 16 }}>{tt('التنبيهات', 'Notifications')}</div>
      <div style={card}>
        <div style={row}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 600 }}>{tt('التذكيرات الذكية', 'Smart reminders')}</div>
            <div style={{ fontSize: 10, color: 'var(--sub)', marginTop: 2 }}>{tt('بيانات قديمة، أرقام تحتاج تحققًا، صور منتهية', 'Stale data, numbers needing verification, expired photos')}</div>
          </div>
          <Toggle on={s.ntf2} onToggle={() => set({ ntf2: !s.ntf2 })} />
        </div>
      </div>

      <div style={{ background: 'var(--card)', border: '1px solid var(--bd)', borderRadius: 16, marginTop: 16, padding: '13px 15px', display: 'flex', alignItems: 'center', gap: 11 }}>
        <div style={{ width: 38, height: 38, borderRadius: 12, background: 'var(--pri)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700 }}>SB</div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 12.5, fontWeight: 700 }}>SalesBook</div>
          <div style={{ fontSize: 10, color: 'var(--sub)', marginTop: 1 }}>{tt('الإصدار 1.0.0 · بياناتك معزولة ومشفرة على مستوى الشركة', 'Version 1.0.0 · Your data is isolated and encrypted at the company level')}</div>
        </div>
      </div>
      <div style={{ height: 30 }} />
    </div>
  );
}
