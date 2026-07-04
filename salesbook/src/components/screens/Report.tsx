'use client';
import { useApp } from '@/state/app';
import { useI18n } from '@/state/i18n';
import { Icon } from '@/components/ui';
import { tone, scoreCol } from '@/lib/tokens';

export function Report() {
  const { s, data, set, update, root, repNext, repBack, toast } = useApp();
  const { t, tt } = useI18n();

  const repC = data.customers.find((x) => x.id === s.repCust) || null;

  const stepN = Math.min(s.reportStep, 7);
  const progW = `${(stepN / 7) * 100}%`;
  const stepTitles = [
    '',
    tt('اختر العميل', 'Choose customer'),
    tt('تقييم الدفع', 'Payment rating'),
    tt('حركة المنتجات', 'Product movement'),
    tt('المسؤولون', 'Contacts'),
    tt('الصور', 'Photos'),
    tt('ملاحظة صوتية', 'Voice note'),
    tt('المراجعة والإرسال', 'Review & submit'),
  ];
  const nextLabel = s.reportStep >= 7 ? tt('إرسال للمراجعة', 'Submit for review') : tt('متابعة', 'Continue');

  const payGradeOpts = [
    { t: tt('ممتاز', 'Excellent'), g: 'A', v: 'g', fill: 5, d: tt('يسدد خلال 0–5 أيام', 'Pays within 0–5 days') },
    { t: tt('جيد', 'Good'), g: 'B', v: 'b', fill: 4, d: tt('يسدد خلال 6–14 يوم', 'Pays within 6–14 days') },
    { t: tt('متوسط', 'Average'), g: 'C', v: 'a', fill: 3, d: tt('تأخير 15–30 يوم', '15–30 day delay') },
    { t: tt('مرتفع الخطورة', 'High risk'), g: 'D', v: 'r', fill: 1, d: tt('تأخير يتجاوز 30 يوم', 'Delay over 30 days') },
  ];
  const moveMeterOpts = [
    { t: tt('سريعة', 'Fast'), v: 'g', pos: '84%', d: tt('إعادة طلب خلال أسبوعين', 'Reorders within two weeks') },
    { t: tt('متوسطة', 'Medium'), v: 'a', pos: '52%', d: tt('إعادة طلب خلال شهر', 'Reorders within a month') },
    { t: tt('بطيئة', 'Slow'), v: 'r', pos: '20%', d: tt('أبطأ من شهر — يحتاج عرضًا', 'Slower than a month — needs a promo') },
  ];

  const payLabelMap: Record<string, string> = {
    g: tt('ممتاز · A', 'Excellent · A'), b: tt('جيد · B', 'Good · B'),
    a: tt('متوسط · C', 'Average · C'), r: tt('مرتفع الخطورة · D', 'High risk · D'),
  };
  const moveLabelMap: Record<string, string> = {
    g: tt('سريعة', 'Fast'), a: tt('متوسطة', 'Medium'), r: tt('بطيئة', 'Slow'),
  };
  const sumPayTn = tone(s.repPay || 'n');
  const sumPayT = s.repPay && payLabelMap[s.repPay] ? payLabelMap[s.repPay] : '—';
  const sumMoveTn = tone(s.repMove || 'n');
  const sumMoveT = s.repMove && moveLabelMap[s.repMove] ? moveLabelMap[s.repMove] : '—';
  const sumContacts = `${repC ? repC.contacts.length : 0} ${tt('مسؤولين', 'contacts')}`;
  const sumPhotos = tt(`${s.repPhotos} صور`, `${s.repPhotos} photos`);
  const sumVoice = s.repVoice ? tt('مسجلة ✓', 'Recorded ✓') : tt('بدون', 'None');
  const doneCust = repC ? t(repC.name) : '';

  const addPhoto = () => {
    if (s.repPhotos >= 6) { toast({ ar: 'الحد الأقصى 6 صور', en: 'Max 6 photos' }); return; }
    update((p) => ({ repPhotos: p.repPhotos + 1 }));
  };
  const toggleVoice = () => update((p) => ({ repVoice: !p.repVoice }));
  const finishReport = () => { root('home'); toast({ ar: 'أُرسل تقريرك لقائمة المراجعة', en: 'Your report was sent to the review queue' }); };

  const voiceLabel = s.repVoice ? tt('جارٍ التسجيل… اضغط للإيقاف', 'Recording… tap to stop') : tt('اضغط لتسجيل ملاحظة صوتية', 'Tap to record a voice note');
  const voiceC = s.repVoice ? 'var(--red)' : 'var(--sub)';

  const inSteps = s.reportStep >= 1 && s.reportStep <= 7;

  return (
    <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', animation: 'fadeUp .26s cubic-bezier(.22,1,.36,1) both' }}>
      {inSteps && (
        <>
          <div style={{ flex: 'none', padding: '8px 20px 0' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span onClick={repBack} style={{ cursor: 'pointer', width: 36, height: 36, flex: 'none', borderRadius: 12, background: 'var(--card)', border: '1px solid var(--bd)', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'transform .15s' }}>
                <Icon name="back" size={16} stroke="var(--tx)" sw={2} />
              </span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 16, fontWeight: 700 }}>{stepTitles[stepN]}</div>
                <div style={{ fontSize: 10.5, color: 'var(--sub)', marginTop: 1 }}>{tt(`الخطوة ${stepN} من 7`, `Step ${stepN} of 7`)}</div>
              </div>
              <span onClick={() => root('home')} style={{ cursor: 'pointer', fontSize: 11, fontWeight: 700, color: 'var(--fnt)' }}>{tt('إلغاء', 'Cancel')}</span>
            </div>
            <div style={{ height: 5, borderRadius: 3, background: 'var(--dv)', marginTop: 12, overflow: 'hidden' }}>
              <span style={{ display: 'block', height: '100%', width: progW, borderRadius: 3, background: 'var(--pri)', transition: 'width .4s cubic-bezier(.22,1,.36,1)' }} />
            </div>
          </div>

          <div data-scroll="true" style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '14px 20px 10px' }}>
            {/* step 1: pick customer */}
            {s.reportStep === 1 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 9, animation: 'fadeUp .25s both' }}>
                {data.customers.map((x) => {
                  const on = s.repCust === x.id;
                  return (
                    <div key={x.id} onClick={() => set({ repCust: x.id })} style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 12, background: on ? 'var(--priT)' : 'var(--card)', border: `1.5px solid ${on ? 'var(--pri)' : 'var(--bd)'}`, borderRadius: 15, padding: '12px 14px', transition: 'all .18s' }}>
                      <div style={{ width: 44, height: 44, flex: 'none', borderRadius: 12, background: 'repeating-linear-gradient(45deg,var(--dv) 0 8px,var(--chip) 8px 16px)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><span style={{ font: "500 7px 'IBM Plex Mono',monospace", color: 'var(--fnt)' }}>store</span></div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13.5, fontWeight: 700 }}>{t(x.name)}</div>
                        <div style={{ fontSize: 11, color: 'var(--sub)', marginTop: 2 }}>{t(x.area)} · {tt('آخر تحديث', 'Last updated')} {t(x.updWhen)}</div>
                      </div>
                      <span style={{ fontSize: 13, fontWeight: 700, color: scoreCol(x.score) }}>{x.score}</span>
                    </div>
                  );
                })}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--ambT)', borderRadius: 12, padding: '10px 13px', marginTop: 2 }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--amb)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><path d="M12 8v5M12 16.5v.5" /></svg>
                  <span style={{ fontSize: 11, color: 'var(--ambTx)', lineHeight: 1.6 }}>{tt('عند إنشاء عميل جديد سيتم فحص التكرار تلقائيًا (الاسم، الهاتف، الموقع)', 'When creating a new customer, duplicates are checked automatically (name, phone, location)')}</span>
                </div>
              </div>
            )}

            {/* step 2: payment grade */}
            {s.reportStep === 2 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 9, animation: 'fadeUp .25s both' }}>
                {payGradeOpts.map((o) => {
                  const on = s.repPay === o.v;
                  const tn = tone(o.v);
                  return (
                    <div key={o.v} onClick={() => set({ repPay: o.v })} style={{ cursor: 'pointer', background: on ? tn.bg : 'var(--card)', border: `1.5px solid ${on ? tn.d : 'var(--bd)'}`, borderRadius: 15, padding: '13px 15px', transition: 'all .18s' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
                        <span style={{ fontSize: 22, fontWeight: 700, color: tn.d, width: 26, textAlign: 'center' }}>{o.g}</span>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 13.5, fontWeight: 700 }}>{o.t}</div>
                          <div style={{ fontSize: 10.5, color: 'var(--sub)', marginTop: 1 }}>{o.d}</div>
                        </div>
                        <span style={{ width: 19, height: 19, flex: 'none', borderRadius: '50%', border: `2px solid ${on ? tn.d : 'var(--bd)'}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><span style={{ width: 9, height: 9, borderRadius: '50%', background: on ? tn.d : 'transparent', transition: 'all .18s' }} /></span>
                      </div>
                      <div style={{ display: 'flex', gap: 3, marginTop: 10 }}>
                        {Array.from({ length: 5 }, (_, i) => <span key={i} style={{ flex: 1, height: 6, borderRadius: 3, background: i < o.fill ? tn.d : 'var(--dv)' }} />)}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* step 3: movement meter */}
            {s.reportStep === 3 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 9, animation: 'fadeUp .25s both' }}>
                {moveMeterOpts.map((o) => {
                  const on = s.repMove === o.v;
                  const tn = tone(o.v);
                  return (
                    <div key={o.v} onClick={() => set({ repMove: o.v })} style={{ cursor: 'pointer', background: on ? tn.bg : 'var(--card)', border: `1.5px solid ${on ? tn.d : 'var(--bd)'}`, borderRadius: 15, padding: '13px 15px', transition: 'all .18s' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 13.5, fontWeight: 700 }}>{o.t}</div>
                          <div style={{ fontSize: 10.5, color: 'var(--sub)', marginTop: 1 }}>{o.d}</div>
                        </div>
                        <span style={{ width: 19, height: 19, flex: 'none', borderRadius: '50%', border: `2px solid ${on ? tn.d : 'var(--bd)'}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><span style={{ width: 9, height: 9, borderRadius: '50%', background: on ? tn.d : 'transparent', transition: 'all .18s' }} /></span>
                      </div>
                      <div style={{ position: 'relative', height: 9, borderRadius: 5, marginTop: 12, background: 'linear-gradient(-90deg,var(--red) 0 33%,var(--amb) 33% 66%,var(--grn) 66% 100%)', opacity: 0.85 }} />
                      <div style={{ position: 'relative', height: 0 }}><span style={{ position: 'absolute', top: -14, insetInlineStart: o.pos, transform: 'translateX(50%)', width: 3.5, height: 19, borderRadius: 2, background: 'var(--tx)' }} /></div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* step 4: contacts */}
            {s.reportStep === 4 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 9, animation: 'fadeUp .25s both' }}>
                <div style={{ fontSize: 11.5, color: 'var(--sub)', lineHeight: 1.7 }}>{tt('حدّث بيانات المسؤولين الحاليين أو أضف مسؤولًا جديدًا — كل تعديل يدخل قائمة المراجعة قبل ظهوره للجميع.', 'Update the current contacts or add a new one — every edit enters the review queue before it shows to everyone.')}</div>
                {(repC ? repC.contacts : []).map((k, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 11, background: 'var(--card)', border: '1px solid var(--bd)', borderRadius: 14, padding: '11px 14px' }}>
                    <div style={{ width: 38, height: 38, flex: 'none', borderRadius: '50%', background: 'var(--chip)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, color: 'var(--lnk)' }}>{k.ini}</div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12.5, fontWeight: 700 }}>{t(k.n)}</div>
                      <div style={{ fontSize: 10.5, color: 'var(--sub)', marginTop: 1 }}>{t(k.role)} · <span style={{ direction: 'ltr', unicodeBidi: 'embed' }}>{k.phone}</span></div>
                    </div>
                    <span onClick={() => toast({ ar: `فتح تعديل ${k.n.ar}`, en: `Open edit for ${k.n.en}` })} style={{ cursor: 'pointer', fontSize: 10.5, fontWeight: 700, color: 'var(--lnk)', background: 'var(--priT)', borderRadius: 8, padding: '6px 12px', transition: 'transform .15s' }}>{tt('تحديث', 'Update')}</span>
                  </div>
                ))}
                <div onClick={() => toast({ ar: 'فتح نموذج إضافة مسؤول جديد', en: 'Open the new-contact form' })} style={{ cursor: 'pointer', border: '1.5px dashed var(--bd)', borderRadius: 14, padding: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, color: 'var(--lnk)', fontSize: 12, fontWeight: 700, transition: 'all .15s' }}>
                  <Icon name="plus" size={14} stroke="var(--lnk)" sw={2} />{tt('إضافة مسؤول جديد', 'Add new contact')}
                </div>
              </div>
            )}

            {/* step 5: photos */}
            {s.reportStep === 5 && (
              <div style={{ animation: 'fadeUp .25s both' }}>
                <div style={{ fontSize: 11.5, color: 'var(--sub)', lineHeight: 1.7 }}>{tt('وثّق الواجهة والأرفف والثلاجات والعروض — الصور الحديثة ترفع درجة اكتمال الملف.', 'Document the storefront, shelves, fridges and promos — recent photos raise the profile completeness.')}</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 11 }}>
                  {Array.from({ length: s.repPhotos }, (_, i) => (
                    <div key={i} style={{ height: 100, borderRadius: 13, background: 'repeating-linear-gradient(45deg,var(--dv) 0 9px,var(--chip) 9px 18px)', position: 'relative', animation: 'ringPop .3s both' }}>
                      <span style={{ position: 'absolute', bottom: 7, right: 8, fontSize: 9, fontWeight: 700, color: 'var(--tx)', background: 'var(--card)', borderRadius: 6, padding: '2.5px 7px' }}>{tt(`صورة ${i + 1}`, `Photo ${i + 1}`)}</span>
                      <span style={{ position: 'absolute', top: 7, left: 8, width: 20, height: 20, borderRadius: '50%', background: 'var(--grn)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 10, fontWeight: 700 }}>✓</span>
                    </div>
                  ))}
                  <div onClick={addPhoto} style={{ cursor: 'pointer', height: 100, borderRadius: 13, border: '1.5px dashed var(--bd)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6, color: 'var(--lnk)', transition: 'all .15s' }}>
                    <Icon name="camera" size={18} stroke="var(--lnk)" sw={2} />
                    <span style={{ fontSize: 10.5, fontWeight: 700 }}>{tt('التقاط صورة', 'Take photo')}</span>
                  </div>
                </div>
              </div>
            )}

            {/* step 6: voice */}
            {s.reportStep === 6 && (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', paddingTop: 26, animation: 'fadeUp .25s both' }}>
                <div onClick={toggleVoice} style={{ cursor: 'pointer', position: 'relative', width: 104, height: 104, transition: 'transform .15s' }}>
                  {s.repVoice && <span style={{ position: 'absolute', inset: 0, borderRadius: '50%', background: 'var(--redT)', animation: 'pulseSoft 1.6s infinite' }} />}
                  <span style={{ position: 'absolute', inset: 10, borderRadius: '50%', background: voiceC, display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'background .3s', boxShadow: '0 10px 26px var(--sh)' }}>
                    <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3" /></svg>
                  </span>
                </div>
                <div style={{ fontSize: 13.5, fontWeight: 700, marginTop: 18, color: 'var(--tx)' }}>{voiceLabel}</div>
                {s.repVoice && (
                  <>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 3, marginTop: 16, height: 26 }}>
                      {[10, 20, 14, 24, 12, 18, 9].map((h, i) => <span key={i} style={{ width: 4, height: h, borderRadius: 2, background: 'var(--red)', animation: `recPulse 1s ${i * 0.1}s infinite` }} />)}
                    </div>
                    <span style={{ font: "500 11px 'IBM Plex Mono',monospace", color: 'var(--red)', marginTop: 8 }}>● 0:07</span>
                  </>
                )}
                <div style={{ fontSize: 11, color: 'var(--fnt)', marginTop: 18, lineHeight: 1.7 }}>{tt('اختيارية — مفيدة للتفاصيل التي يصعب كتابتها أثناء الحركة', 'Optional — useful for details hard to type on the move')}</div>
              </div>
            )}

            {/* step 7: summary */}
            {s.reportStep === 7 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 9, animation: 'fadeUp .25s both' }}>
                <div style={{ background: 'var(--card)', border: '1px solid var(--bd)', borderRadius: 15, overflow: 'hidden' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', borderBottom: '1px solid var(--dv)' }}><span style={{ fontSize: 11, color: 'var(--fnt)', width: 70 }}>{tt('العميل', 'Customer')}</span><span style={{ fontSize: 12.5, fontWeight: 700 }}>{doneCust}</span></div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', borderBottom: '1px solid var(--dv)' }}><span style={{ fontSize: 11, color: 'var(--fnt)', width: 70 }}>{tt('الدفع', 'Payment')}</span><span style={{ fontSize: 11, fontWeight: 700, color: sumPayTn.c, background: sumPayTn.bg, borderRadius: 7, padding: '4px 10px' }}>{sumPayT}</span></div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', borderBottom: '1px solid var(--dv)' }}><span style={{ fontSize: 11, color: 'var(--fnt)', width: 70 }}>{tt('الحركة', 'Movement')}</span><span style={{ fontSize: 11, fontWeight: 700, color: sumMoveTn.c, background: sumMoveTn.bg, borderRadius: 7, padding: '4px 10px' }}>{sumMoveT}</span></div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', borderBottom: '1px solid var(--dv)' }}><span style={{ fontSize: 11, color: 'var(--fnt)', width: 70 }}>{tt('المسؤولون', 'Contacts')}</span><span style={{ fontSize: 12.5, fontWeight: 600 }}>{sumContacts}</span></div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', borderBottom: '1px solid var(--dv)' }}><span style={{ fontSize: 11, color: 'var(--fnt)', width: 70 }}>{tt('الصور', 'Photos')}</span><span style={{ fontSize: 12.5, fontWeight: 600 }}>{sumPhotos}</span></div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px' }}><span style={{ fontSize: 11, color: 'var(--fnt)', width: 70 }}>{tt('صوتية', 'Voice')}</span><span style={{ fontSize: 12.5, fontWeight: 600 }}>{sumVoice}</span></div>
                </div>
                <textarea placeholder={tt('ملاحظة مكتوبة (اختيارية) — ماذا يجب أن يعرف زميلك قبل الزيارة القادمة؟', 'Written note (optional) — what should your colleague know before the next visit?')} style={{ width: '100%', boxSizing: 'border-box', minHeight: 88, background: 'var(--card)', border: '1px solid var(--bd)', borderRadius: 14, padding: '12px 14px', fontSize: 12.5, color: 'var(--tx)', outline: 'none', resize: 'none', lineHeight: 1.7 }} />
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--priT)', borderRadius: 12, padding: '10px 13px' }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--lnk)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><path d="M12 8v5M12 16.5v.5" /></svg>
                  <span style={{ fontSize: 11, color: 'var(--lnk)', lineHeight: 1.6 }}>{tt('سيدخل التقرير قائمة المراجعة، ويظهر للجميع بعد اعتماد المشرف', 'The report enters the review queue and shows to everyone after admin approval')}</span>
                </div>
              </div>
            )}
          </div>

          <div style={{ flex: 'none', padding: '10px 20px 20px', background: 'var(--bg)' }}>
            <div onClick={repNext} style={{ cursor: 'pointer', height: 52, borderRadius: 14, background: 'var(--pri)', color: 'var(--onPri)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, fontSize: 14.5, fontWeight: 700, boxShadow: '0 8px 22px var(--sh)', transition: 'transform .15s,background .2s' }}>
              {nextLabel}
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 6-6 6 6 6" /></svg>
            </div>
          </div>
        </>
      )}

      {/* step 8: done */}
      {s.reportStep === 8 && (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: '0 34px', animation: 'fadeUp .3s both' }}>
          <div style={{ position: 'relative', width: 96, height: 96 }}>
            <span style={{ position: 'absolute', inset: 0, borderRadius: '50%', background: 'var(--grnT)', animation: 'pulseSoft 2.4s infinite' }} />
            <span style={{ position: 'absolute', inset: 9, borderRadius: '50%', background: 'var(--grn)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 14px 34px var(--sh)' }}>
              <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="m5 12.5 4.5 4.5L19 7.5" strokeDasharray="48" strokeDashoffset="0" style={{ animation: 'drawCheck .6s cubic-bezier(.22,1,.36,1) both' }} /></svg>
            </span>
          </div>
          <div style={{ fontSize: 19, fontWeight: 700, marginTop: 22 }}>{tt('أُرسل تقريرك للمراجعة', 'Your report was sent for review')}</div>
          <div style={{ fontSize: 12.5, color: 'var(--sub)', lineHeight: 1.8, marginTop: 8 }}>
            {tt('تقريرك عن ', 'Your report on ')}<span style={{ fontWeight: 700, color: 'var(--tx)' }}>{doneCust}</span>{tt(' دخل قائمة المراجعة.', ' entered the review queue.')}<br />{tt('سيظهر للجميع فور اعتماده — وستحصل على نقاط السمعة.', 'It will show to everyone once approved — and you’ll earn reputation points.')}
          </div>
          <span style={{ marginTop: 15, fontSize: 11.5, fontWeight: 700, color: 'var(--ambTx)', background: 'var(--ambT)', borderRadius: 99, padding: '7px 15px' }}>● {tt('قيد المراجعة', 'Under review')}</span>
          <div onClick={finishReport} style={{ cursor: 'pointer', marginTop: 26, height: 50, width: '100%', borderRadius: 14, background: 'var(--pri)', color: 'var(--onPri)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13.5, fontWeight: 700, boxShadow: '0 8px 22px var(--sh)', transition: 'transform .15s' }}>{tt('العودة للرئيسية', 'Back to home')}</div>
        </div>
      )}
    </div>
  );
}
