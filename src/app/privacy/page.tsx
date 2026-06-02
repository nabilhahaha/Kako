import type { Metadata } from 'next';
import { LegalShell, LegalSection } from '@/components/legal-shell';
import { SUPPORT_PHONES } from '@/lib/erp/contact';

export const metadata: Metadata = { title: 'سياسة الخصوصية | VANTORA' };

export default function PrivacyPage() {
  return (
    <LegalShell title="سياسة الخصوصية">
      <p className="text-muted-foreground">
        تشرح هذه السياسة كيف يجمع نظام VANTORA بياناتك ويستخدمها ويحميها عند استخدامك للخدمة.
        باستخدامك للخدمة فأنت توافق على ما ورد في هذه السياسة.
      </p>

      <LegalSection heading="١. البيانات التي نجمعها">
        <p>نجمع البيانات اللازمة لتشغيل الخدمة فقط، وتشمل:</p>
        <ul className="list-disc space-y-1 pe-5">
          <li>بيانات الحساب: الاسم والبريد الإلكتروني ورقم الهاتف.</li>
          <li>بيانات الشركة التي تنشئها: المنتجات والعملاء والفواتير والمعاملات.</li>
          <li>بيانات استخدام تقنية أساسية لتأمين الحساب وتحسين الأداء.</li>
        </ul>
      </LegalSection>

      <LegalSection heading="٢. كيف نستخدم البيانات">
        <p>نستخدم بياناتك لتقديم الخدمة وتشغيلها، وتأمين حسابك، وتقديم الدعم الفني، وإرسال إشعارات متعلقة بالخدمة أو الاشتراك. لا نبيع بياناتك لأي طرف ثالث.</p>
      </LegalSection>

      <LegalSection heading="٣. عزل البيانات بين الشركات">
        <p>بيانات كل شركة معزولة تماماً عن غيرها على مستوى قاعدة البيانات، ولا يطّلع عليها سوى المستخدمين المصرّح لهم داخل الشركة نفسها.</p>
      </LegalSection>

      <LegalSection heading="٤. الحماية والتخزين">
        <p>تُخزَّن البيانات لدى مزوّد بنية تحتية موثوق، وتُنقل عبر اتصال مشفّر. نتّبع إجراءات صلاحيات دقيقة لكل مستخدم لتقليل الوصول غير الضروري.</p>
      </LegalSection>

      <LegalSection heading="٥. مشاركة البيانات">
        <p>لا نشارك بياناتك إلا عند الضرورة لتشغيل الخدمة (مثل مزوّد الاستضافة)، أو عند طلب قانوني رسمي، أو بموافقتك الصريحة.</p>
      </LegalSection>

      <LegalSection heading="٦. حقوقك">
        <p>يحق لك الوصول إلى بياناتك وتصحيحها، وطلب تصدير بيانات شركتك أو حذف حسابك، وذلك بالتواصل معنا عبر القنوات الموضّحة أدناه.</p>
      </LegalSection>

      <LegalSection heading="٧. التواصل">
        <p>لأي استفسار بخصوص الخصوصية تواصل معنا عبر:</p>
        <ul className="list-disc space-y-1 pe-5">
          {SUPPORT_PHONES.map((p) => (
            <li key={p.phone} dir="ltr" className="text-right">{p.display}</li>
          ))}
        </ul>
      </LegalSection>
    </LegalShell>
  );
}
