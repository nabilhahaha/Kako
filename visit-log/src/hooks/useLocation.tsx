import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import type { LatLng } from '@/lib/geo'

type Status = 'idle' | 'locating' | 'granted' | 'denied' | 'unavailable'

interface LocationContextValue {
  location: LatLng | null
  status: Status
  /** Force a fresh position read (e.g. a "recenter" button). */
  refresh: () => void
}

const LocationContext = createContext<LocationContextValue | null>(null)

const LAST_KNOWN_KEY = 'vl-last-location'

function readCached(): LatLng | null {
  try {
    const raw = localStorage.getItem(LAST_KNOWN_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (typeof parsed?.latitude === 'number' && typeof parsed?.longitude === 'number') return parsed
  } catch {
    /* ignore */
  }
  return null
}

/**
 * App-wide current location. Watches position so Map, New Visit, Customer
 * Details and the route tools all share one live fix. Falls back to the last
 * known position (persisted) so distances still render offline or before the
 * first fix resolves.
 */
export function LocationProvider({ children }: { children: ReactNode }) {
  const [location, setLocation] = useState<LatLng | null>(() => readCached())
  const [status, setStatus] = useState<Status>('idle')
  const watchId = useRef<number | null>(null)

  const apply = useCallback((position: GeolocationPosition) => {
    const next = {
      latitude: Number(position.coords.latitude.toFixed(6)),
      longitude: Number(position.coords.longitude.toFixed(6)),
    }
    setLocation(next)
    setStatus('granted')
    try {
      localStorage.setItem(LAST_KNOWN_KEY, JSON.stringify(next))
    } catch {
      /* ignore */
    }
  }, [])

  const start = useCallback(() => {
    if (!('geolocation' in navigator)) {
      setStatus('unavailable')
      return
    }
    setStatus((current) => (current === 'granted' ? current : 'locating'))
    navigator.geolocation.getCurrentPosition(apply, (error) => {
      setStatus(error.code === error.PERMISSION_DENIED ? 'denied' : 'unavailable')
    }, { enableHighAccuracy: true, timeout: 12000, maximumAge: 30000 })

    if (watchId.current === null && 'geolocation' in navigator) {
      watchId.current = navigator.geolocation.watchPosition(apply, () => {}, {
        enableHighAccuracy: true,
        timeout: 20000,
        maximumAge: 15000,
      })
    }
  }, [apply])

  useEffect(() => {
    start()
    return () => {
      if (watchId.current !== null) navigator.geolocation.clearWatch(watchId.current)
      watchId.current = null
    }
  }, [start])

  return (
    <LocationContext.Provider value={{ location, status, refresh: start }}>
      {children}
    </LocationContext.Provider>
  )
}

export function useLocation() {
  const context = useContext(LocationContext)
  if (!context) throw new Error('useLocation must be used inside LocationProvider')
  return context
}
