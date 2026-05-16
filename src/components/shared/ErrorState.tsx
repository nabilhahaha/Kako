import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface ErrorStateProps {
  title?: string;
  message?: string;
  onRetry?: () => void;
}

export function ErrorState({
  title = 'حدث خطأ',
  message = 'تعذّر تحميل البيانات. أعد المحاولة.',
  onRetry,
}: ErrorStateProps) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-destructive/20 bg-destructive/5 px-6 py-10 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10 text-destructive">
        <AlertTriangle className="h-6 w-6" />
      </div>
      <h3 className="text-h3 text-foreground">{title}</h3>
      <p className="max-w-md text-sm text-muted-foreground">{message}</p>
      {onRetry && (
        <Button onClick={onRetry} variant="outline" size="sm" className="mt-2">
          أعد المحاولة
        </Button>
      )}
    </div>
  );
}
