'use client';

import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useI18n } from '@/lib/i18n/provider';
import { X, ScanLine, Camera } from 'lucide-react';

/**
 * VANTORA — generic Scanning Framework (platform-wide, reusable by every pack).
 *
 * A single enterprise scanner: camera-based barcode/QR via the native
 * BarcodeDetector (no dependency), plus a manual-entry fallback that also serves
 * hardware USB/Bluetooth scanners (they type the code + Enter). Continuous mode
 * keeps the camera open and de-dupes repeat reads, so a cashier can scan item
 * after item without touching the mouse. Consumers (POS, warehouse, clinic…)
 * just provide `onScan`; the not-found / link behaviour lives in the consumer.
 *
 * Future-ready: `formats` accepts QR + 1D symbologies today; an OCR backend can
 * be added behind the same `onScan` contract.
 */

export type ScanType = 'barcode' | 'qr' | 'ocr';
export interface ScanResult { value: string; format: string }

interface DetectedBarcode { rawValue: string; format: string }
interface BarcodeDetectorLike { detect(src: CanvasImageSource): Promise<DetectedBarcode[]> }
type BarcodeDetectorCtor = new (opts?: { formats?: string[] }) => BarcodeDetectorLike;

const DEFAULT_FORMATS = [
  'ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39', 'itf', 'codabar', 'qr_code',
];

export function CameraScanner({
  open, onClose, onScan, continuous = true, formats = DEFAULT_FORMATS,
}: {
  open: boolean;
  onClose: () => void;
  onScan: (r: ScanResult) => void;
  continuous?: boolean;
  formats?: string[];
}) {
  const { t } = useI18n();
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const loopRef = useRef<number | null>(null);
  const lastRef = useRef<{ value: string; at: number }>({ value: '', at: 0 });
  const [unsupported, setUnsupported] = useState(false);
  const [manual, setManual] = useState('');

  useEffect(() => {
    if (!open) return;
    const Ctor = (globalThis as unknown as { BarcodeDetector?: BarcodeDetectorCtor }).BarcodeDetector;
    let cancelled = false;

    async function start() {
      if (!Ctor || !navigator.mediaDevices?.getUserMedia) { setUnsupported(true); return; }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
        if (cancelled) { stream.getTracks().forEach((tr) => tr.stop()); return; }
        streamRef.current = stream;
        const video = videoRef.current;
        if (!video) return;
        video.srcObject = stream;
        await video.play();
        const detector = new Ctor({ formats });
        const tick = async () => {
          if (cancelled || !videoRef.current) return;
          try {
            const found = await detector.detect(videoRef.current);
            if (found.length) {
              const code = found[0].rawValue?.trim();
              const now = Date.now();
              // De-dupe the same code within 1.5s so one item isn't added twice.
              if (code && !(code === lastRef.current.value && now - lastRef.current.at < 1500)) {
                lastRef.current = { value: code, at: now };
                onScan({ value: code, format: found[0].format });
                if (!continuous) { onClose(); return; }
              }
            }
          } catch { /* transient detect error — keep looping */ }
          loopRef.current = window.setTimeout(tick, 250);
        };
        tick();
      } catch {
        setUnsupported(true);
      }
    }
    start();

    return () => {
      cancelled = true;
      if (loopRef.current) window.clearTimeout(loopRef.current);
      streamRef.current?.getTracks().forEach((tr) => tr.stop());
      streamRef.current = null;
    };
  }, [open, continuous, formats, onScan, onClose]);

  if (!open) return null;

  function submitManual() {
    const v = manual.trim();
    if (!v) return;
    onScan({ value: v, format: 'manual' });
    setManual('');
    if (!continuous) onClose();
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-xl bg-card p-4 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between">
          <h3 className="flex items-center gap-2 font-semibold"><ScanLine className="h-5 w-5 text-primary" /> {t('scan.title')}</h3>
          <button onClick={onClose} className="rounded-md p-1 hover:bg-secondary"><X className="h-5 w-5" /></button>
        </div>

        {unsupported ? (
          <p className="mb-3 rounded-md bg-muted/40 p-3 text-sm text-muted-foreground">{t('scan.unsupported')}</p>
        ) : (
          <div className="relative mb-3 overflow-hidden rounded-lg bg-black">
            {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
            <video ref={videoRef} className="h-56 w-full object-cover" muted playsInline />
            <div className="pointer-events-none absolute inset-0 m-auto h-24 w-3/4 rounded-lg border-2 border-primary/80" />
            <p className="absolute bottom-1 start-0 end-0 text-center text-[11px] text-white/80">{t('scan.point')}</p>
          </div>
        )}

        {/* Manual entry — also receives hardware USB/Bluetooth scanner input. */}
        <div className="flex gap-2">
          <Input
            autoFocus value={manual} onChange={(e) => setManual(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); submitManual(); } }}
            placeholder={t('scan.manualPlaceholder')} className="h-11" inputMode="numeric"
          />
          <Button className="h-11" onClick={submitManual}><Camera className="h-4 w-4" /> {t('scan.add')}</Button>
        </div>
      </div>
    </div>
  );
}

/** Drop-in trigger: a button that opens the camera scanner. */
export function ScanButton({
  onScan, continuous = true, label, className,
}: {
  onScan: (r: ScanResult) => void;
  continuous?: boolean;
  label?: string;
  className?: string;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button type="button" variant="outline" className={className} onClick={() => setOpen(true)}>
        <ScanLine className="h-4 w-4" /> {label ?? t('scan.title')}
      </Button>
      <CameraScanner open={open} onClose={() => setOpen(false)} onScan={onScan} continuous={continuous} />
    </>
  );
}
