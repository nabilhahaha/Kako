import { useEffect, useState } from 'react'

export interface GeoState {
  status: 'locating' | 'granted' | 'denied' | 'unavailable'
  latitude: number | null
  longitude: number | null
}

/**
 * Silently captures the current position once on mount. Never blocks the UI:
 * a visit simply saves without coordinates when permission is missing.
 */
export function useGeolocation(): GeoState {
  const [state, setState] = useState<GeoState>({
    status: 'locating',
    latitude: null,
    longitude: null,
  })

  useEffect(() => {
    if (!('geolocation' in navigator)) {
      setState({ status: 'unavailable', latitude: null, longitude: null })
      return
    }
    let cancelled = false
    navigator.geolocation.getCurrentPosition(
      (position) => {
        if (cancelled) return
        setState({
          status: 'granted',
          latitude: Number(position.coords.latitude.toFixed(6)),
          longitude: Number(position.coords.longitude.toFixed(6)),
        })
      },
      (error) => {
        if (cancelled) return
        setState({
          status: error.code === error.PERMISSION_DENIED ? 'denied' : 'unavailable',
          latitude: null,
          longitude: null,
        })
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 },
    )
    return () => {
      cancelled = true
    }
  }, [])

  return state
}
