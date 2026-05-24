import { useState, useCallback } from 'react';
import {
  Plus,
  Pencil,
  Trash2,
  ChevronUp,
  ChevronDown,
  GripVertical,
  ToggleLeft,
  ToggleRight,
} from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';

import {
  useAllDynamicFields,
  useCreateDynamicField,
  useUpdateDynamicField,
  useDeleteDynamicField,
  useReorderDynamicFields,
} from '@/hooks/useDynamicForms';
import type { DynamicFormField, DynamicFieldType } from '@/lib/types';

/* ───────────── constants ───────────── */

const FIELD_TYPE_OPTIONS: { value: DynamicFieldType; label: string }[] = [
  { value: 'text', label: 'نص' },
  { value: 'number', label: 'رقم' },
  { value: 'dropdown', label: 'قائمة منسدلة' },
  { value: 'multi_select', label: 'اختيار متعدد' },
  { value: 'date', label: 'تاريخ' },
  { value: 'time', label: 'وقت' },
  { value: 'photo', label: 'صورة' },
  { value: 'gps', label: 'موقع' },
  { value: 'toggle', label: 'تبديل' },
  { value: 'rating', label: 'تقييم' },
  { value: 'notes', label: 'ملاحظات' },
];

const fieldTypeLabel = (t: DynamicFieldType) =>
  FIELD_TYPE_OPTIONS.find((o) => o.value === t)?.label ?? t;

const HAS_OPTIONS: DynamicFieldType[] = ['dropdown', 'multi_select'];

/* ───────────── blank form state ───────────── */

interface FieldFormState {
  field_key: string;
  field_type: DynamicFieldType;
  label: string;
  label_ar: string;
  section: string;
  is_required: boolean;
  options: { value: string; label: string; label_ar?: string }[];
}

const BLANK_FORM: FieldFormState = {
  field_key: '',
  field_type: 'text',
  label: '',
  label_ar: '',
  section: '',
  is_required: false,
  options: [],
};

/* ───────────── helpers ───────────── */

function slugify(text: string) {
  return text
    .toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_]/g, '');
}

function groupBySection(fields: DynamicFormField[]) {
  const map = new Map<string, DynamicFormField[]>();
  for (const f of fields) {
    const key = f.section ?? 'عام';
    const arr = map.get(key) ?? [];
    arr.push(f);
    map.set(key, arr);
  }
  return map;
}

/* ───────────── Component ───────────── */

interface DynamicFormBuilderProps {
  formKey: string;
  formTitle: string;
}

export function DynamicFormBuilder({ formKey, formTitle }: DynamicFormBuilderProps) {
  const { data: fields = [], isLoading } = useAllDynamicFields(formKey);
  const createField = useCreateDynamicField();
  const updateField = useUpdateDynamicField();
  const deleteField = useDeleteDynamicField();
  const reorderFields = useReorderDynamicFields();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FieldFormState>(BLANK_FORM);

  /* ── dialog open/close ── */

  const openAdd = useCallback(() => {
    setEditingId(null);
    setForm(BLANK_FORM);
    setDialogOpen(true);
  }, []);

  const openEdit = useCallback((field: DynamicFormField) => {
    setEditingId(field.id);
    setForm({
      field_key: field.field_key,
      field_type: field.field_type,
      label: field.label,
      label_ar: field.label_ar ?? '',
      section: field.section ?? '',
      is_required: field.is_required,
      options: field.options ?? [],
    });
    setDialogOpen(true);
  }, []);

  const closeDialog = useCallback(() => {
    setDialogOpen(false);
    setEditingId(null);
    setForm(BLANK_FORM);
  }, []);

  /* ── form field changes ── */

  function patch(updates: Partial<FieldFormState>) {
    setForm((prev) => {
      const next = { ...prev, ...updates };
      // auto-generate field_key from label when creating
      if (!editingId && updates.label !== undefined) {
        next.field_key = slugify(updates.label);
      }
      return next;
    });
  }

  /* ── option management ── */

  function addOption() {
    setForm((prev) => ({
      ...prev,
      options: [...prev.options, { value: '', label: '', label_ar: '' }],
    }));
  }

  function updateOption(
    idx: number,
    key: 'value' | 'label' | 'label_ar',
    val: string,
  ) {
    setForm((prev) => {
      const opts = [...prev.options];
      opts[idx] = { ...opts[idx], [key]: val };
      // auto-set value from label
      if (key === 'label') {
        opts[idx].value = slugify(val);
      }
      return { ...prev, options: opts };
    });
  }

  function removeOption(idx: number) {
    setForm((prev) => ({
      ...prev,
      options: prev.options.filter((_, i) => i !== idx),
    }));
  }

  /* ── save (create / update) ── */

  async function handleSave() {
    if (!form.label.trim()) {
      toast.error('يرجى إدخال اسم الحقل');
      return;
    }
    if (!form.field_key.trim()) {
      toast.error('يرجى إدخال مفتاح الحقل');
      return;
    }

    const optionsPayload = HAS_OPTIONS.includes(form.field_type) ? form.options : null;

    try {
      if (editingId) {
        await updateField.mutateAsync({
          id: editingId,
          form_key: formKey,
          updates: {
            field_key: form.field_key,
            field_type: form.field_type,
            label: form.label,
            label_ar: form.label_ar || null,
            section: form.section || null,
            is_required: form.is_required,
            options: optionsPayload,
          },
        });
        toast.success('تم تحديث الحقل');
      } else {
        const maxSort = fields.reduce(
          (max, f) => Math.max(max, f.sort_order),
          0,
        );
        await createField.mutateAsync({
          form_key: formKey,
          field_key: form.field_key,
          field_type: form.field_type,
          label: form.label,
          label_ar: form.label_ar || null,
          section: form.section || null,
          is_required: form.is_required,
          options: optionsPayload,
          sort_order: maxSort + 1,
        });
        toast.success('تمت إضافة الحقل');
      }
      closeDialog();
    } catch (err) {
      toast.error('حدث خطأ أثناء الحفظ');
      console.error(err);
    }
  }

  /* ── reorder ── */

  async function moveField(fieldId: string, direction: 'up' | 'down') {
    const sorted = [...fields].sort((a, b) => a.sort_order - b.sort_order);
    const idx = sorted.findIndex((f) => f.id === fieldId);
    if (idx < 0) return;

    const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= sorted.length) return;

    const updates = [
      { id: sorted[idx].id, sort_order: sorted[swapIdx].sort_order },
      { id: sorted[swapIdx].id, sort_order: sorted[idx].sort_order },
    ];

    try {
      await reorderFields.mutateAsync({ form_key: formKey, fields: updates });
    } catch {
      toast.error('فشل إعادة الترتيب');
    }
  }

  /* ── toggle active ── */

  async function toggleActive(field: DynamicFormField) {
    try {
      await updateField.mutateAsync({
        id: field.id,
        form_key: formKey,
        updates: { is_active: !field.is_active },
      });
      toast.success(field.is_active ? 'تم تعطيل الحقل' : 'تم تفعيل الحقل');
    } catch {
      toast.error('حدث خطأ');
    }
  }

  /* ── delete ── */

  async function handleDelete(field: DynamicFormField) {
    try {
      await deleteField.mutateAsync({ id: field.id, form_key: formKey });
      toast.success('تم حذف الحقل');
    } catch {
      toast.error('فشل حذف الحقل');
    }
  }

  /* ── render ── */

  const sections = groupBySection(fields);

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-4">
          <CardTitle>{formTitle}</CardTitle>
          <Button size="sm" onClick={openAdd}>
            <Plus className="h-4 w-4" />
            إضافة حقل
          </Button>
        </CardHeader>

        <CardContent>
          {isLoading && (
            <p className="text-center text-muted-foreground py-8">جار التحميل...</p>
          )}

          {!isLoading && fields.length === 0 && (
            <p className="text-center text-muted-foreground py-8 border border-dashed rounded-lg">
              لا توجد حقول بعد. أضف حقلاً جديداً للبدء.
            </p>
          )}

          {!isLoading &&
            Array.from(sections.entries()).map(([sectionName, sectionFields]) => (
              <div key={sectionName} className="mb-6 last:mb-0">
                <h3 className="text-sm font-semibold text-muted-foreground mb-3 border-b border-border pb-2">
                  {sectionName}
                </h3>
                <div className="space-y-2">
                  {sectionFields.map((field) => (
                    <div
                      key={field.id}
                      className={`flex items-center gap-3 rounded-lg border p-3 transition-colors ${
                        field.is_active
                          ? 'border-border bg-card'
                          : 'border-border/50 bg-muted/30 opacity-60'
                      }`}
                    >
                      <GripVertical className="h-4 w-4 text-muted-foreground shrink-0" />

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium text-sm truncate">
                            {field.label_ar || field.label}
                          </span>
                          <Badge variant="secondary" className="text-[10px]">
                            {fieldTypeLabel(field.field_type)}
                          </Badge>
                          {field.is_required && (
                            <Badge variant="destructive" className="text-[10px]">
                              مطلوب
                            </Badge>
                          )}
                          {!field.is_active && (
                            <Badge variant="outline" className="text-[10px]">
                              معطّل
                            </Badge>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {field.field_key} · ترتيب: {field.sort_order}
                        </p>
                      </div>

                      {/* Actions */}
                      <div className="flex items-center gap-1 shrink-0">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          title="تعديل"
                          onClick={() => openEdit(field)}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          title="نقل لأعلى"
                          onClick={() => moveField(field.id, 'up')}
                        >
                          <ChevronUp className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          title="نقل لأسفل"
                          onClick={() => moveField(field.id, 'down')}
                        >
                          <ChevronDown className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          title={field.is_active ? 'تعطيل' : 'تفعيل'}
                          onClick={() => toggleActive(field)}
                        >
                          {field.is_active ? (
                            <ToggleRight className="h-4 w-4 text-primary" />
                          ) : (
                            <ToggleLeft className="h-4 w-4" />
                          )}
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-destructive hover:text-destructive"
                          title="حذف"
                          onClick={() => handleDelete(field)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
        </CardContent>
      </Card>

      {/* ── Add / Edit Dialog ── */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingId ? 'تعديل الحقل' : 'إضافة حقل جديد'}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            {/* Label */}
            <div className="space-y-1.5">
              <Label htmlFor="df-label">الاسم (إنجليزي)</Label>
              <Input
                id="df-label"
                value={form.label}
                onChange={(e) => patch({ label: e.target.value })}
                placeholder="Field label"
                dir="ltr"
              />
            </div>

            {/* Label AR */}
            <div className="space-y-1.5">
              <Label htmlFor="df-label-ar">الاسم (عربي)</Label>
              <Input
                id="df-label-ar"
                value={form.label_ar}
                onChange={(e) => patch({ label_ar: e.target.value })}
                placeholder="اسم الحقل بالعربي"
              />
            </div>

            {/* Field Key */}
            <div className="space-y-1.5">
              <Label htmlFor="df-key">مفتاح الحقل</Label>
              <Input
                id="df-key"
                value={form.field_key}
                onChange={(e) => patch({ field_key: e.target.value })}
                placeholder="field_key"
                dir="ltr"
              />
            </div>

            {/* Field Type */}
            <div className="space-y-1.5">
              <Label htmlFor="df-type">نوع الحقل</Label>
              <select
                id="df-type"
                value={form.field_type}
                onChange={(e) =>
                  patch({ field_type: e.target.value as DynamicFieldType })
                }
                className="flex h-10 w-full rounded-lg border border-input bg-background px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {FIELD_TYPE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Section */}
            <div className="space-y-1.5">
              <Label htmlFor="df-section">القسم</Label>
              <Input
                id="df-section"
                value={form.section}
                onChange={(e) => patch({ section: e.target.value })}
                placeholder="اسم القسم (اختياري)"
              />
            </div>

            {/* Required */}
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="df-required"
                checked={form.is_required}
                onChange={(e) => patch({ is_required: e.target.checked })}
                className="h-4 w-4 rounded border-input accent-primary"
              />
              <Label htmlFor="df-required">حقل مطلوب</Label>
            </div>

            {/* Options (for dropdown / multi_select) */}
            {HAS_OPTIONS.includes(form.field_type) && (
              <div className="space-y-2">
                <Label>الخيارات</Label>
                {form.options.map((opt, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <Input
                      value={opt.label}
                      onChange={(e) => updateOption(idx, 'label', e.target.value)}
                      placeholder="اسم الخيار"
                      className="flex-1"
                      dir="ltr"
                    />
                    <Input
                      value={opt.label_ar ?? ''}
                      onChange={(e) =>
                        updateOption(idx, 'label_ar', e.target.value)
                      }
                      placeholder="بالعربي"
                      className="flex-1"
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 shrink-0 text-destructive"
                      onClick={() => removeOption(idx)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ))}
                <Button variant="outline" size="sm" onClick={addOption}>
                  <Plus className="h-3.5 w-3.5" />
                  إضافة خيار
                </Button>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={closeDialog}>
              إلغاء
            </Button>
            <Button
              onClick={handleSave}
              disabled={createField.isPending || updateField.isPending}
            >
              {createField.isPending || updateField.isPending
                ? 'جار الحفظ...'
                : 'حفظ'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
