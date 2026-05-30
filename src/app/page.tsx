import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getUserContext } from '@/lib/erp/auth-context';
import { resolveHomePath } from '@/lib/erp/home';
import { Logo } from '@/components/brand/logo';
import { whatsappLink, SUPPORT_PHONES } from '@/lib/erp/contact';
import {
  Stethoscope, UtensilsCrossed, Scissors, ShoppingCart, Boxes,
  Pill, WashingMachine, BedDouble, Truck, ShieldCheck, BarChart3, Wallet,
  Smartphone, Check, ArrowLeft, MessageCircle,
} from 'lucide-react';

const BUSINESS_TYPES = [
  { icon: Stethoscope, label: 'العيادات' },
  { icon: UtensilsCrossed, label: 'المطاعم والكافيهات' },
  { icon: Scissors, label: 'الصالونات' },
  { icon: ShoppingCart, label: 'السوبر ماركت' },
  { icon: Boxes, label: 'تجارة الجملة' },
  { icon: Pill, label: 'الصيدليات' },
  { icon: WashingMachine, label: 'المغاسل' },
  { icon: BedDouble, label: 'الفنادق' },
  { icon: Truck, label: 'التوزيع والمناديب' },
];

const FEATURES = [
  { icon: Wallet, title: 'محاسبة متكاملة', desc: 'الفواتير والتحصيل والمصروفات تترحّل تلقائياً لقيود مزدوجة متوازنة.' },
  { icon: BarChart3, title: 'تقارير لحظية', desc: 'مبيعاتك ومديونياتك ومخزونك في لوحة واحدة واضحة.' },
  { icon: ShieldCheck, title: 'بياناتك محميّة', desc: 'عزل كامل بين الشركات وصلاحيات دقيقة لكل موظف.' },
  { icon: Smartphone, title: 'يشتغل على الموبايل', desc: 'افتح شغلك من أي مكان — كله عربي ومن اليمين لليسار.' },
];

export default async function HomePage() {
  // Signed-in users go straight to the right home for their role; visitors see
  // the landing page.
  const ctx = await getUserContext();
  if (ctx) redirect(resolveHomePath(ctx));

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Nav */}
      <header className="sticky top-0 z-30 border-b bg-background/80 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
          <Logo withWordmark />
          <div className="flex items-center gap-2">
            <Link href="/login" className="rounded-lg px-4 py-2 text-sm font-medium hover:bg-secondary">تسجيل الدخول</Link>
            <Link href="/register" className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90">ابدأ مجاناً</Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="mx-auto max-w-6xl px-4 py-16 text-center sm:py-24">
        <span className="inline-block rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary">نظام إدارة أعمال — يتأقلم مع نشاطك</span>
        <h1 className="mx-auto mt-5 max-w-3xl text-3xl font-bold leading-tight sm:text-5xl">
          برنامج واحد يدير شغلك كله،<br className="hidden sm:block" /> أيًّا كان نشاطك
        </h1>
        <p className="mx-auto mt-5 max-w-2xl text-base text-muted-foreground sm:text-lg">
          عيادة، مطعم، صالون، محل، أو شركة توزيع — AMS بيظبط نفسه على نشاطك ويديك المبيعات والمخزون والمحاسبة وفريق العمل في مكان واحد.
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Link href="/register" className="inline-flex h-12 items-center gap-2 rounded-lg bg-primary px-6 font-medium text-primary-foreground hover:opacity-90">
            ابدأ تجربتك المجانية <ArrowLeft className="h-4 w-4" />
          </Link>
          <a href={whatsappLink('مرحباً، أريد معرفة المزيد عن AMS.')} target="_blank" rel="noopener noreferrer"
            className="inline-flex h-12 items-center gap-2 rounded-lg border px-6 font-medium hover:bg-secondary">
            <MessageCircle className="h-4 w-4" /> تواصل معنا
          </a>
        </div>
        <p className="mt-4 text-xs text-muted-foreground">تجربة مجانية · بدون بطاقة بنكية</p>
      </section>

      {/* Business types */}
      <section className="border-t bg-secondary/30 py-16">
        <div className="mx-auto max-w-6xl px-4">
          <h2 className="text-center text-2xl font-bold">مصمّم لنشاطك أنت</h2>
          <p className="mt-2 text-center text-sm text-muted-foreground">اختر نوع نشاطك ويظهرلك بس اللي يخصّك — بدون تعقيد.</p>
          <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-3">
            {BUSINESS_TYPES.map((b) => (
              <div key={b.label} className="flex items-center gap-3 rounded-xl border bg-card p-4">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <b.icon className="h-5 w-5" />
                </span>
                <span className="font-medium">{b.label}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="py-16">
        <div className="mx-auto max-w-6xl px-4">
          <h2 className="text-center text-2xl font-bold">كل اللي محتاجه عشان تشتغل صح</h2>
          <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {FEATURES.map((f) => (
              <div key={f.title} className="rounded-xl border bg-card p-5">
                <span className="flex h-11 w-11 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <f.icon className="h-5 w-5" />
                </span>
                <h3 className="mt-3 font-semibold">{f.title}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="border-t bg-primary/5 py-16">
        <div className="mx-auto max-w-3xl px-4 text-center">
          <h2 className="text-2xl font-bold">جاهز تبدأ؟</h2>
          <p className="mt-2 text-sm text-muted-foreground">سجّل دلوقتي وجهّز شركتك في دقائق.</p>
          <ul className="mx-auto mt-6 inline-flex flex-col gap-2 text-right text-sm">
            {['تسجيل سريع بخطوات بسيطة', 'اختَر نشاطك وابدأ فوراً', 'دعم عبر واتساب'].map((t) => (
              <li key={t} className="flex items-center gap-2"><Check className="h-4 w-4 text-success" /> {t}</li>
            ))}
          </ul>
          <div className="mt-8">
            <Link href="/register" className="inline-flex h-12 items-center gap-2 rounded-lg bg-primary px-8 font-medium text-primary-foreground hover:opacity-90">
              ابدأ مجاناً <ArrowLeft className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t py-8">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-4 text-sm text-muted-foreground sm:flex-row">
          <Logo withWordmark className="text-foreground" />
          <div className="flex flex-wrap items-center justify-center gap-4">
            <Link href="/privacy" className="hover:text-foreground">سياسة الخصوصية</Link>
            <Link href="/terms" className="hover:text-foreground">الشروط والأحكام</Link>
            {SUPPORT_PHONES.map((p) => (
              <a key={p.phone} href={whatsappLink(undefined, p.phone)} target="_blank" rel="noopener noreferrer" className="hover:text-foreground" dir="ltr">{p.display}</a>
            ))}
          </div>
        </div>
        <p className="mt-4 text-center text-xs text-muted-foreground">AMS © {new Date().getFullYear()}</p>
      </footer>
    </div>
  );
}
