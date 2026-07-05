const MAX_DIMENSION = 1600
const THUMB_DIMENSION = 480
const JPEG_QUALITY = 0.82
const THUMB_QUALITY = 0.72

async function loadImage(file: Blob): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(file)
  try {
    const img = new Image()
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve()
      img.onerror = () => reject(new Error('Could not read image'))
      img.src = url
    })
    return img
  } finally {
    URL.revokeObjectURL(url)
  }
}

async function encode(
  source: Blob,
  maxDimension: number,
  quality: number,
): Promise<Blob> {
  const img = await loadImage(source)
  const scale = Math.min(1, maxDimension / Math.max(img.naturalWidth, img.naturalHeight))
  const width = Math.round(img.naturalWidth * scale)
  const height = Math.round(img.naturalHeight * scale)

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) return source
  ctx.drawImage(img, 0, 0, width, height)

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, 'image/jpeg', quality),
  )
  return blob ?? source
}

/**
 * Downscales to max 1600px on the longest side and re-encodes as JPEG before
 * upload. Falls back to the original file if decoding fails (e.g. HEIC on a
 * non-Safari browser) so a save is never blocked by compression.
 */
export async function compressImage(file: Blob): Promise<Blob> {
  try {
    const blob = await encode(file, MAX_DIMENSION, JPEG_QUALITY)
    // Re-encoding tiny images can grow them; keep the smaller of the two.
    return blob.size < file.size ? blob : file
  } catch {
    return file
  }
}

/** Small (~480px) JPEG derivative for avatars, list thumbnails and map cards. */
export async function compressThumbnail(file: Blob): Promise<Blob> {
  try {
    return await encode(file, THUMB_DIMENSION, THUMB_QUALITY)
  } catch {
    return file
  }
}
