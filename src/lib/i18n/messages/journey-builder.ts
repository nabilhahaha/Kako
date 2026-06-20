/** Weekly Single-Salesman Journey Builder. ar/en symmetric. */
export const ar = {
  journeyBuilder: {
    title: 'مُنشئ خط سير المندوب',
    description: 'خطة أسبوعية لمندوب واحد: اختر المندوب ← أسبوع ← أيام العمل ← حد الزيارات اليومي ← توليد ← مراجعة باليوم ← تعديل ← تصدير.',
    selectSalesman: 'المندوب',
    pickSalesman: 'اختر مندوباً',
    horizon: 'المدى',
    week: 'أسبوع',
    monthSoon: 'شهر (قريباً)',
    regenerate: 'إعادة التوليد',
    capacityOk: '{visits} زيارة/أسبوع ضمن السعة ({cap}).',
    capacityWarn: '{visits} زيارة/أسبوع تتجاوز السعة ({cap}) — زِد الأيام أو قلّل الحِمل.',
    reviewHint: 'راجِع الخطة باليوم؛ اسحب العملاء بين الأيام لإعادة الجدولة.',
  },
};

export const en = {
  journeyBuilder: {
    title: 'Salesman Journey Builder',
    description: 'A weekly plan for one salesman: select salesman → Week → Working Days → Max Visits/Day → Generate → Review by Day → Adjust → Export.',
    selectSalesman: 'Salesman',
    pickSalesman: 'Pick a salesman',
    horizon: 'Horizon',
    week: 'Week',
    monthSoon: 'Month (soon)',
    regenerate: 'Regenerate',
    capacityOk: '{visits} visits/week within capacity ({cap}).',
    capacityWarn: '{visits} visits/week exceed capacity ({cap}) — add days or reduce the load.',
    reviewHint: 'Review the plan by day; drag customers between days to reschedule.',
  },
};
