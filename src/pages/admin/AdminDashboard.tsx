import { Link } from 'react-router-dom';
import {
  Users,
  Upload,
  Settings,
  ShieldCheck,
  ArrowLeft,
} from 'lucide-react';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card } from '@/components/ui/card';

const SECTIONS = [
  {
    to: '/admin/users',
    icon: Users,
    title: 'إدارة المستخدمين',
    desc: 'إضافة وتعديل المستخدمين والأدوار والصلاحيات',
    color: 'bg-blue-500/10 text-blue-600',
  },
  {
    to: '/admin/customers-upload',
    icon: Upload,
    title: 'رفع العملاء',
    desc: 'استيراد بيانات العملاء من ملف Excel',
    color: 'bg-green-500/10 text-green-600',
  },
  {
    to: '/admin/settings',
    icon: Settings,
    title: 'الإعدادات',
    desc: 'إدارة المنتجات وأسباب الزيارة وأصناف المنتجات',
    color: 'bg-purple-500/10 text-purple-600',
  },
  {
    to: '/admin/audit',
    icon: ShieldCheck,
    title: 'سجل النشاط',
    desc: 'تتبع جميع الإجراءات والتعديلات',
    color: 'bg-orange-500/10 text-orange-600',
  },
];

export function AdminDashboard() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="لوحة تحكم النظام"
        description="إدارة المستخدمين والعملاء والمنتجات والإعدادات"
      />

      <div className="grid gap-4 sm:grid-cols-2">
        {SECTIONS.map((s) => (
          <Link key={s.to} to={s.to} className="group">
            <Card className="flex items-start gap-4 p-5 transition-all hover:border-primary/30 hover:shadow-lg active:scale-[0.98]">
              <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl ${s.color}`}>
                <s.icon className="h-6 w-6" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-base font-semibold text-foreground">{s.title}</p>
                <p className="mt-1 text-sm text-muted-foreground">{s.desc}</p>
              </div>
              <ArrowLeft className="mt-1 h-5 w-5 shrink-0 text-muted-foreground/50 transition-transform group-hover:-translate-x-1" />
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
