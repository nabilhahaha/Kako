import { z } from 'zod';

export const visitTypeSchema = z.enum(['office', 'branch', 'cashvan', 'hybrid'], {
  errorMap: () => ({ message: 'اختر نوع الزيارة' }),
});

export const gpsCoordsSchema = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  accuracy: z.number().nonnegative(),
  capturedAt: z.string(),
});

// GPS presence is enforced in the wizard step transition + on submit
// (kept out of the schema to keep RHF input/output types aligned).
export const visitWizardSchema = z.object({
  customerId: z.string().uuid({ message: 'اختر عميلاً' }),
  visitType: visitTypeSchema,
  gps: gpsCoordsSchema.nullable(),
  reasonIds: z
    .array(z.string().uuid())
    .min(1, { message: 'اختر سبب الزيارة على الأقل' }),
  photoCount: z.number().min(0),
  notes: z.string().max(1000, 'الملاحظات طويلة جدًا'),
});

export type VisitWizardValues = z.infer<typeof visitWizardSchema>;

export const nearExpirySchema = z.object({
  customerId: z.string().uuid({ message: 'اختر العميل' }),
  productId: z.string().uuid({ message: 'اختر المنتج' }),
  quantity: z
    .number({ invalid_type_error: 'أدخل الكمية' })
    .int('يجب أن تكون الكمية رقمًا صحيحًا')
    .positive('يجب أن تكون الكمية أكبر من صفر'),
  expiryDate: z
    .string()
    .min(1, 'أدخل تاريخ انتهاء الصلاحية')
    .refine((s) => !Number.isNaN(Date.parse(s)), 'تاريخ غير صالح'),
  notes: z.string().max(500),
});

export type NearExpiryValues = z.infer<typeof nearExpirySchema>;

export const visitRequestSchema = z.object({
  assignedTo: z.string().uuid({ message: 'اختر المندوب' }),
  customerId: z.string().uuid({ message: 'اختر العميل' }),
  dueDate: z.string().min(1, 'أدخل التاريخ المستهدف'),
  notes: z.string().max(500),
});

export type VisitRequestValues = z.infer<typeof visitRequestSchema>;

export const financialRequestSchema = z.object({
  customerId: z.string().uuid({ message: 'اختر العميل' }),
  ttlMinutes: z
    .number()
    .int()
    .min(1, 'الحد الأدنى دقيقة واحدة')
    .max(60, 'الحد الأقصى 60 دقيقة'),
  reason: z.string().min(3, 'وضّح سبب الطلب').max(300),
});

export type FinancialRequestValues = z.infer<typeof financialRequestSchema>;
