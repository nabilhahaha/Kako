import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';

export function NotFoundPage() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 text-center">
      <p className="text-display text-muted-foreground">404</p>
      <h1 className="text-h1 text-foreground">الصفحة غير موجودة</h1>
      <p className="max-w-md text-sm text-muted-foreground">
        تعذّر العثور على ما تبحث عنه. تحقق من الرابط أو ارجع للصفحة الرئيسية.
      </p>
      <Button asChild>
        <Link to="/">العودة للرئيسية</Link>
      </Button>
    </div>
  );
}
