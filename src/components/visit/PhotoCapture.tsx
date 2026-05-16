import { useEffect, useRef, useState } from 'react';
import { Camera, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { validateFreshPhoto } from '@/lib/photoFreshness';

interface PhotoCaptureProps {
  files: File[];
  onChange: (files: File[]) => void;
  max?: number;
}

interface PreviewItem {
  url: string;
  file: File;
}

export function PhotoCapture({ files, onChange, max = 5 }: PhotoCaptureProps) {
  const cameraRef = useRef<HTMLInputElement>(null);
  const [previews, setPreviews] = useState<PreviewItem[]>([]);

  useEffect(() => {
    const items = files.map((file) => ({ url: URL.createObjectURL(file), file }));
    setPreviews(items);
    return () => {
      items.forEach((p) => URL.revokeObjectURL(p.url));
    };
  }, [files]);

  async function appendFiles(input: HTMLInputElement | null) {
    if (!input?.files?.length) return;
    const incoming = Array.from(input.files);
    input.value = '';

    const remaining = Math.max(0, max - files.length);
    const candidates = incoming.slice(0, remaining);

    const accepted: File[] = [];
    for (const file of candidates) {
      const result = await validateFreshPhoto(file);
      if (result.ok) {
        accepted.push(file);
      } else {
        toast.error('تم رفض الصورة', { description: result.reasonAr });
      }
    }

    if (accepted.length > 0) {
      onChange([...files, ...accepted]);
    }
  }

  function removeAt(idx: number) {
    onChange(files.filter((_, i) => i !== idx));
  }

  const canAdd = files.length < max;

  return (
    <div className="space-y-3">
      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="sr-only"
        onChange={() => {
          void appendFiles(cameraRef.current);
        }}
      />

      {previews.length > 0 && (
        <div className="grid grid-cols-3 gap-2">
          {previews.map((p, idx) => (
            <div
              key={p.url}
              className="group relative aspect-square overflow-hidden rounded-lg border border-border bg-muted"
            >
              <img
                src={p.url}
                alt={`صورة ${idx + 1}`}
                className="h-full w-full object-cover"
              />
              <button
                type="button"
                onClick={() => removeAt(idx)}
                className="absolute end-1 top-1 inline-flex h-7 w-7 items-center justify-center rounded-full bg-background/90 text-destructive shadow-sm transition-opacity hover:bg-background"
                aria-label="حذف الصورة"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      {canAdd && (
        <Button
          type="button"
          variant="default"
          className="h-auto w-full py-4"
          onClick={() => cameraRef.current?.click()}
        >
          <Camera className="h-4 w-4" />
          التقاط صورة
        </Button>
      )}

      <p className="text-caption">
        {files.length} / {max} صور · كاميرا مباشرة فقط — لا يمكن رفع صور من المعرض
      </p>
    </div>
  );
}
