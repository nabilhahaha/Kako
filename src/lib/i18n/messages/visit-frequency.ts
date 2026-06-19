/** Visit-frequency field + resolved-frequency display (FR-3). ar/en symmetric. */
export const ar = {
  visitFreq: {
    fieldLabel: 'تكرار الزيارة',
    fieldHint: 'القيمة على مستوى العميل لها الأولوية على توصية التصنيف.',
    resolvedTitle: 'تكرار الزيارة',
    recommendedLabel: 'الموصى به',
    none: 'غير محدد',
    // cadence options / labels
    optionInherit: 'افتراضي (حسب التصنيف)',
    weekly: 'أسبوعي',
    biweekly: 'كل أسبوعين',
    monthly: 'شهري',
    annual: 'سنوي',
    perCycle: '{n}× {unit}',
    // sources
    srcManual: 'يدوي',
    srcImport: 'مستورد',
    srcPlanning: 'التخطيط',
    srcClassification: 'توصية التصنيف',
    srcSystem: 'افتراضي النظام',
  },
};

export const en = {
  visitFreq: {
    fieldLabel: 'Visit Frequency',
    fieldHint: 'The customer-level value takes priority over the classification recommendation.',
    resolvedTitle: 'Visit frequency',
    recommendedLabel: 'Recommended',
    none: 'Not set',
    // cadence options / labels
    optionInherit: 'Default (by classification)',
    weekly: 'Weekly',
    biweekly: 'Biweekly',
    monthly: 'Monthly',
    annual: 'Annual',
    perCycle: '{n}× {unit}',
    // sources
    srcManual: 'Manual',
    srcImport: 'Import',
    srcPlanning: 'Planning',
    srcClassification: 'Classification Recommendation',
    srcSystem: 'System Default',
  },
};
