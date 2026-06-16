import { useState } from 'react';

export interface GeoFix {
  latitude: number;
  longitude: number;
  accuracy: number;
}

export function useGeolocation() {
  const [fix, setFix] = useState<GeoFix | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function capture(): Promise<GeoFix | null> {
    return new Promise((resolve) => {
      if (typeof navigator === 'undefined' || !navigator.geolocation) {
        setError('Geolocation unavailable');
        resolve(null);
        return;
      }
      setBusy(true);
      setError(null);
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const g: GeoFix = {
            latitude: pos.coords.latitude,
            longitude: pos.coords.longitude,
            accuracy: pos.coords.accuracy,
          };
          setFix(g);
          setBusy(false);
          resolve(g);
        },
        (err) => {
          setError(err.message);
          setBusy(false);
          resolve(null);
        },
        { enableHighAccuracy: true, timeout: 10_000, maximumAge: 30_000 },
      );
    });
  }

  return { fix, busy, error, capture };
}
