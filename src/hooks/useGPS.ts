import { useCallback, useState } from 'react';
import type { GPSCoords } from '@/lib/types';

export type GPSError =
  | { code: 'unsupported'; message: string }
  | { code: 'denied'; message: string }
  | { code: 'unavailable'; message: string }
  | { code: 'timeout'; message: string };

interface UseGPSResult {
  coords: GPSCoords | null;
  loading: boolean;
  error: GPSError | null;
  capture: () => Promise<GPSCoords | null>;
  reset: () => void;
}

const TIMEOUT_MS = 15000;

function mapError(err: GeolocationPositionError): GPSError {
  switch (err.code) {
    case err.PERMISSION_DENIED:
      return {
        code: 'denied',
        message: 'تم رفض الإذن. فعّل خدمات الموقع في المتصفح ثم أعد المحاولة.',
      };
    case err.POSITION_UNAVAILABLE:
      return {
        code: 'unavailable',
        message: 'تعذّر تحديد الموقع. تأكد من تفعيل GPS وأن إشارتك جيدة.',
      };
    case err.TIMEOUT:
      return {
        code: 'timeout',
        message: 'انتهت مهلة تحديد الموقع. أعد المحاولة.',
      };
    default:
      return { code: 'unavailable', message: 'حدث خطأ غير متوقع أثناء تحديد الموقع.' };
  }
}

export function useGPS(): UseGPSResult {
  const [coords, setCoords] = useState<GPSCoords | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<GPSError | null>(null);

  const capture = useCallback((): Promise<GPSCoords | null> => {
    setError(null);

    if (!('geolocation' in navigator)) {
      const err: GPSError = {
        code: 'unsupported',
        message: 'متصفحك لا يدعم خدمات الموقع.',
      };
      setError(err);
      return Promise.resolve(null);
    }

    setLoading(true);

    return new Promise((resolve) => {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const result: GPSCoords = {
            latitude: pos.coords.latitude,
            longitude: pos.coords.longitude,
            accuracy: pos.coords.accuracy,
            capturedAt: new Date().toISOString(),
          };
          setCoords(result);
          setLoading(false);
          resolve(result);
        },
        (err) => {
          setError(mapError(err));
          setLoading(false);
          resolve(null);
        },
        {
          enableHighAccuracy: true,
          timeout: TIMEOUT_MS,
          maximumAge: 0,
        },
      );
    });
  }, []);

  const reset = useCallback(() => {
    setCoords(null);
    setError(null);
  }, []);

  return { coords, loading, error, capture, reset };
}
