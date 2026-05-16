import { MapPin, Loader2, CheckCircle2, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useGPS } from '@/hooks/useGPS';
import type { GPSCoords } from '@/lib/types';
import { useEffect } from 'react';

interface GPSCaptureProps {
  value: GPSCoords | null;
  onChange: (coords: GPSCoords | null) => void;
}

export function GPSCapture({ value, onChange }: GPSCaptureProps) {
  const { coords, loading, error, capture } = useGPS();

  useEffect(() => {
    if (coords) onChange(coords);
  }, [coords, onChange]);

  async function handleCapture() {
    const result = await capture();
    if (result) onChange(result);
  }

  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-border bg-card p-4">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <MapPin className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            {value ? (
              <>
                <div className="flex items-center gap-2 text-success">
                  <CheckCircle2 className="h-4 w-4" />
                  <span className="text-sm font-medium">تم تسجيل الموقع</span>
                </div>
                <p className="mt-1 break-all text-caption tabular-nums">
                  {value.latitude.toFixed(6)}, {value.longitude.toFixed(6)} · دقة ±
                  {Math.round(value.accuracy)}م
                </p>
              </>
            ) : (
              <>
                <p className="text-sm font-medium text-foreground">سجّل موقعك الحالي</p>
                <p className="mt-1 text-caption">
                  يلزم تفعيل خدمة الموقع للمتابعة. سيتم استخدام الموقع لإثبات الزيارة.
                </p>
              </>
            )}
          </div>
        </div>

        {error && (
          <div className="mt-3 flex items-start gap-2 rounded-lg bg-destructive/10 p-3 text-destructive">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <div className="space-y-1">
              <p className="text-sm font-medium">تعذّر تحديد الموقع</p>
              <p className="text-caption text-destructive/80">{error.message}</p>
            </div>
          </div>
        )}

        <Button
          type="button"
          variant={value ? 'outline' : 'default'}
          size="sm"
          className="mt-3 w-full"
          onClick={handleCapture}
          disabled={loading}
        >
          {loading ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              جاري التحديد...
            </>
          ) : value ? (
            'إعادة تحديد الموقع'
          ) : (
            'تحديد الموقع الآن'
          )}
        </Button>
      </div>
    </div>
  );
}
