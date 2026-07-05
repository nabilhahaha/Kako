import { fetchSignedUrls } from '@/lib/api'

const PDF_MAX_DIM = 900
const PDF_QUALITY = 0.72

async function toDownscaledJpeg(blob: Blob, maxDim: number): Promise<string | null> {
  const url = URL.createObjectURL(blob)
  try {
    const img = new Image()
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve()
      img.onerror = () => reject(new Error('decode'))
      img.src = url
    })
    const scale = Math.min(1, maxDim / Math.max(img.naturalWidth, img.naturalHeight))
    const w = Math.round(img.naturalWidth * scale)
    const h = Math.round(img.naturalHeight * scale)
    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')
    if (!ctx) return null
    ctx.drawImage(img, 0, 0, w, h)
    return canvas.toDataURL('image/jpeg', PDF_QUALITY)
  } catch {
    return null
  } finally {
    URL.revokeObjectURL(url)
  }
}

/**
 * Signs, downloads and downscales storage images to JPEG data URLs for the PDF.
 * Processes in small concurrent batches to stay memory-efficient across large
 * reports; failed images are simply omitted rather than aborting the report.
 */
export async function loadReportImages(
  paths: string[],
  onProgress?: (done: number, total: number) => void,
): Promise<Record<string, string>> {
  const unique = Array.from(new Set(paths)).filter(Boolean)
  const result: Record<string, string> = {}
  if (unique.length === 0) return result

  // Sign in chunks (createSignedUrls has practical limits). A signing failure
  // for a chunk (network blip, token refresh, rate limit) must NOT abort the
  // whole report — those images simply fall back to placeholders in the PDF.
  const signed: Record<string, string> = {}
  const SIGN_CHUNK = 100
  for (let i = 0; i < unique.length; i += SIGN_CHUNK) {
    try {
      Object.assign(signed, await fetchSignedUrls(unique.slice(i, i + SIGN_CHUNK)))
    } catch {
      /* leave this chunk unsigned — the renderer draws a placeholder instead */
    }
  }

  let done = 0
  const CONCURRENCY = 4
  for (let i = 0; i < unique.length; i += CONCURRENCY) {
    const batch = unique.slice(i, i + CONCURRENCY)
    await Promise.all(
      batch.map(async (path) => {
        const url = signed[path]
        if (url) {
          try {
            const resp = await fetch(url)
            if (resp.ok) {
              const dataUrl = await toDownscaledJpeg(await resp.blob(), PDF_MAX_DIM)
              if (dataUrl) result[path] = dataUrl
            }
          } catch {
            /* omit on failure */
          }
        }
        done += 1
        onProgress?.(done, unique.length)
      }),
    )
  }
  return result
}
