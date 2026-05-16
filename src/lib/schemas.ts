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

const promotionStatusSchema = z.enum([
  'draft',
  'active',
  'paused',
  'completed',
  'cancelled',
]);

export const promotionSchema = z
  .object({
    name: z.string().min(2, 'الاسم قصير'),
    nameAr: z.string().max(200),
    status: promotionStatusSchema,
    startDate: z.string().min(1, 'أدخل تاريخ البداية'),
    endDate: z.string().min(1, 'أدخل تاريخ النهاية'),
    channelTypes: z.array(z.string()).min(1, 'اختر قناة واحدة على الأقل'),
    expectedRoi: z.number().nullable(),
    tradeSpend: z.number().nullable(),
    notes: z.string().max(500),
  })
  .refine((v) => Date.parse(v.endDate) >= Date.parse(v.startDate), {
    message: 'تاريخ النهاية يجب أن يكون بعد البداية',
    path: ['endDate'],
  });

export type PromotionValues = z.infer<typeof promotionSchema>;

const userRoleSchema = z.enum([
  'admin_relia',
  'presales_rep',
  'presales_supervisor',
  'cashvan_supervisor',
  'regional_manager_roshen',
  'trade_marketing_manager',
  'top_management_relia',
  'top_management_roshen',
]);

export const userEditSchema = z.object({
  fullName: z.string().min(2, 'الاسم قصير').max(100),
  user_type: userRoleSchema,
  region: z.string().max(50).optional().default(''),
  supervisorId: z.string().uuid().nullable(),
  isActive: z.boolean(),
});

export type UserEditValues = z.infer<typeof userEditSchema>;

export const visitReasonEditSchema = z
  .object({
    label: z.string().min(2, 'التسمية قصيرة'),
    labelAr: z.string().max(200),
    availableForOffice: z.boolean(),
    availableForBranch: z.boolean(),
    isActive: z.boolean(),
  })
  .refine((v) => v.availableForOffice || v.availableForBranch, {
    message: 'يجب اختيار نوع زيارة واحد على الأقل',
    path: ['availableForOffice'],
  });

export type VisitReasonEditValues = z.infer<typeof visitReasonEditSchema>;

export const productEditSchema = z.object({
  productCode: z.string().min(1, 'أدخل الكود'),
  productName: z.string().min(2, 'أدخل الاسم'),
  productNameAr: z.string().max(200),
  category: z.string().max(80),
  isActive: z.boolean(),
});

export type ProductEditValues = z.infer<typeof productEditSchema>;
