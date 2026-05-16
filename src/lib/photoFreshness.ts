import exifr from 'exifr';

const MAX_AGE_MS = 5 * 60 * 1000;
const FUTURE_TOLERANCE_MS = 60 * 1000;

export type FreshnessResult =
  | { ok: true }
  | { ok: false; reasonAr: string; reasonEn: string };

async function readExifTimestamp(file: File): Promise<number | null> {
  try {
    const parsed = (await exifr.parse(file, ['DateTimeOriginal', 'DateTime'])) as
      | { DateTimeOriginal?: Date | string; DateTime?: Date | string }
      | null
      | undefined;
    const raw = parsed?.DateTimeOriginal ?? parsed?.DateTime;
    if (!raw) return null;
    const t = raw instanceof Date ? raw.getTime() : Date.parse(String(raw));
    return Number.isFinite(t) ? t : null;
  } catch {
    return null;
  }
}

export async function validateFreshPhoto(file: File): Promise<FreshnessResult> {
  const exifT = await readExifTimestamp(file);
  const t = exifT ?? (Number.isFinite(file.lastModified) ? file.lastModified : null);

  if (t === null) {
    return {
      ok: false,
      reasonAr: 'تعذّر التحقق من وقت الصورة — التقط صورة جديدة',
      reasonEn: 'Could not verify photo time — capture a new one',
    };
  }

  const age = Date.now() - t;
  if (age > MAX_AGE_MS) {
    return {
      ok: false,
      reasonAr: 'الصورة قديمة — التقط صورة جديدة',
      reasonEn: 'Photo is too old — capture a new one',
    };
  }
  if (age < -FUTURE_TOLERANCE_MS) {
    return {
      ok: false,
      reasonAr: 'وقت الصورة غير صحيح — تحقق من إعدادات الجهاز',
      reasonEn: 'Photo timestamp is in the future — check device clock',
    };
  }
  return { ok: true };
}
