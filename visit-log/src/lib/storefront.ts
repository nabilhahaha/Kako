import type { Visit, VisitPhoto } from '@/types'

export interface StorefrontRef {
  full: string
  thumb: string
}

type StorefrontSource = Pick<Visit, 'storefront_photo_url' | 'storefront_thumbnail_url'> & {
  photos?: Pick<VisitPhoto, 'storage_path' | 'position'>[]
}

/**
 * Effective storefront image for a visit. Uses the dedicated storefront columns
 * when present; otherwise falls back to the visit's first gallery photo for
 * backward compatibility with visits captured before the storefront existed.
 */
export function storefrontOf(visit: StorefrontSource): StorefrontRef | null {
  if (visit.storefront_photo_url) {
    return {
      full: visit.storefront_photo_url,
      thumb: visit.storefront_thumbnail_url ?? visit.storefront_photo_url,
    }
  }
  const photos = visit.photos ?? []
  if (photos.length > 0) {
    const first = [...photos].sort((a, b) => a.position - b.position)[0]
    return { full: first.storage_path, thumb: first.storage_path }
  }
  return null
}
