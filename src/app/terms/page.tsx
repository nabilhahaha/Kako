import type { Metadata } from 'next';
import { LegalShell, LegalSection } from '@/components/legal-shell';
import { SUPPORT_PHONES } from '@/lib/erp/contact';

export const metadata: Metadata = { title: 'الشروط والأحكام | AMS' };

export default function TermsPage() {
  return (
    <LegalShell title="الشروط والأحكام">
      <p className="text-muted-foreground">
        تحكم هذه الشروط استخدامك لنظام AMS. باستخدامك للخدمة فأنت توافق عليها بالكامل؛ وإذا لم توافق فيرجى عدم استخدام الخدمة.
      </p>

      <LegalSection heading="١. وصف الخدمة">
        <p>AMS نظام لإدارة الأعمال يتيح إدارة المبيعات والمخزون والمحاسبة وفريق العمل، ويتأقلم مع نوع نشاطك (عيادة، مطعم، صالون، تجارة، توزيع وغيرها).</p>
      </LegalSection>

      <LegalSection heading="٢. الحساب والمسؤولية">
        <p>أنت مسؤول عن صحّة بيانات حسابك، وعن الحفاظ على سرّية كلمة المرور، وعن جميع الأنشطة التي تتم من خلال حسابك ومستخدمي شركتك.</p>
      </LegalSection>

      <LegalSection heading="٣. الاستخدام المقبول">
        <p>تلتزم بعدم استخدام الخدمة في أي نشاط مخالف للقانون، أو محاولة الإضرار بالخدمة أو الوصول غير المصرّح به لبيانات الغير.</p>
      </LegalSection>

      <LegalSection heading="٤. الاشتراك والدفع">
        <p>تُتاح فترة تجريبية مجانية. يستمر الوصول للخدمة بتجديد الاشتراك. عند انتهاء الاشتراك قد يتم تقييد الوصول حتى التجديد. تفاصيل التجديد تتم عبر قنوات التواصل الموضّحة أدناه.</p>
      </LegalSection>

      <LegalSection heading="٥. ملكية البيانات">
        <p>تظل بيانات شركتك ملكاً لك. ويحق لك طلب تصدير بياناتك في أي وقت. نحتفظ بالبيانات طوال سريان حسابك ولفترة معقولة بعد إيقافه لأغراض النسخ الاحتياطي ثم تُحذف.</p>
      </LegalSection>

      <LegalSection heading="٦. حدود المسؤولية">
        <p>نبذل جهدنا لتقديم خدمة مستقرة وآمنة، لكنها تُقدَّم «كما هي». لا نتحمّل المسؤولية عن أضرار غير مباشرة ناتجة عن استخدام الخدمة في حدود ما يسمح به القانون.</p>
      </LegalSection>

      <LegalSection heading="٧. التعديلات والإنهاء">
        <p>قد نُحدّث هذه الشروط أو الخدمة من وقت لآخر، وسنُشعرك بالتغييرات الجوهرية. يمكنك إنهاء استخدامك للخدمة في أي وقت، ويحق لنا تعليق الحسابات المخالفة.</p>
      </LegalSection>

      <LegalSection heading="٨. التواصل">
        <p>لأي استفسار بخصوص هذه الشروط تواصل معنا عبر:</p>
        <ul className="list-disc space-y-1 pe-5">
          {SUPPORT_PHONES.map((p) => (
            <li key={p.phone} dir="ltr" className="text-right">{p.display}</li>
          ))}
        </ul>
      </LegalSection>
    </LegalShell>
  );
}
