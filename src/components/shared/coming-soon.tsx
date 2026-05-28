import { PageHeader } from './page-header';
import { Card, CardContent } from '@/components/ui/card';
import { Construction } from 'lucide-react';

export function ComingSoon({
  title,
  description,
}: {
  title: string;
  description?: string;
}) {
  return (
    <div>
      <PageHeader title={title} description={description} />
      <Card>
        <CardContent className="flex flex-col items-center gap-3 p-12 text-center text-muted-foreground">
          <Construction className="h-10 w-10" />
          <p className="font-medium">هذا الموديول قيد التطوير</p>
          <p className="text-sm">سيتم تفعيله في المرحلة القادمة من بناء النظام.</p>
        </CardContent>
      </Card>
    </div>
  );
}
