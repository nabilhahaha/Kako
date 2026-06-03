/** Company Onboarding Wizard — Platform-Owner-only guided company creation.
 *  ar = source of truth; en mirrors EXACTLY (the i18n parity test enforces
 *  identical key paths). Pack / template / role / module / capability labels
 *  come from lib maps and pick ar/en by locale — they are NOT duplicated here. */
export const ar = {
  onboarding: {
    title: 'إعداد شركة جديدة',
    description: 'تدفّق موجّه لإنشاء شركة: البيانات الأساسية، باقة النشاط، نموذج الصلاحيات، ثم المراجعة والإنشاء.',
    ownerOnly: 'هذه الصفحة متاحة لمالك المنصّة فقط.',

    // stepper
    stepBasics: 'بيانات الشركة',
    stepPack: 'باقة النشاط',
    stepOrg: 'الهيكل التنظيمي',
    stepTemplate: 'نموذج الصلاحيات',
    stepReview: 'المراجعة',
    stepOf: 'الخطوة {current} من {total}',

    // nav
    back: 'رجوع',
    next: 'التالي',
    create: 'إنشاء الشركة بهذا الإعداد',
    creating: 'جارٍ إنشاء الشركة…',

    // step 1 — basics
    basicsTitle: 'البيانات الأساسية',
    basicsHint: 'يُختار نوع النشاط في الخطوة التالية (الباقة).',
    name: 'اسم الشركة (إنجليزي)',
    namePlaceholder: 'Acme Distribution',
    nameRequired: 'اسم الشركة مطلوب.',
    nameAr: 'اسم الشركة (عربي)',
    nameArPlaceholder: 'شركة المثال للتوزيع',
    country: 'الدولة',
    countryPlaceholder: 'السعودية',
    currency: 'العملة',
    language: 'اللغة',
    langAr: 'العربية',
    langEn: 'الإنجليزية',
    timezone: 'المنطقة الزمنية',
    status: 'الحالة',
    statusTrial: 'تجريبي',
    statusActive: 'نشط',
    statusSuspended: 'موقوف',
    adminSection: 'مدير الشركة',
    adminEmail: 'البريد الإلكتروني للمدير',
    adminEmailPlaceholder: 'admin@company.com',
    adminEmailRequired: 'بريد المدير مطلوب.',
    adminName: 'اسم المدير',
    adminNamePlaceholder: 'الاسم الكامل',
    adminPassword: 'كلمة المرور',
    adminPasswordHint: 'اتركها فارغة لإرسال دعوة عبر البريد لاحقاً.',

    // step 2 — pack
    packTitle: 'اختر باقة النشاط',
    packHint: 'تحدّد الباقة شكل النشاط: الوحدات والأدوار والأقسام الحسّاسة. مستقلة عن نموذج الصلاحيات.',
    packModulesRoles: '{modules} وحدة · {roles} دور',

    // step 3 — org structure (optional roles + reporting hierarchy)
    orgTitle: 'الهيكل التنظيمي',
    orgHint: 'اختر الأدوار التي تحتاجها هذه الشركة. الأدوار اختيارية، ويتكيّف تسلسل التبعية تلقائياً مع اختيارك.',
    orgRolesTitle: 'الأدوار',
    orgRolesHint: 'كل الأدوار مُحددة افتراضياً. مدير النظام إلزامي ولا يمكن إلغاؤه.',
    orgRoleMandatory: 'إلزامي',
    orgHierarchyTitle: 'تسلسل التبعية',
    orgHierarchyHint: 'يحدّد تسلسل التبعية نطاق البيانات. يمكن ضبط العمق الخاص بكل فرع بعد الإنشاء.',
    orgReportsTo: 'يتبع لـ',
    orgTopLevel: 'المستوى الأعلى',
    orgRecommendedScope: 'النطاق المُوصى به',
    orgAdminRequired: 'مدير النظام إلزامي لإكمال الإعداد.',

    // step 4 — template
    templateTitle: 'اختر نموذج الصلاحيات',
    templateHint: 'يحدّد النموذج درجة التقييد: القدرات الممنوحة وحدود الاعتماد والأقسام المخفية. يمكن دمج أي نموذج مع أي باقة.',
    previewTitle: 'معاينة مباشرة',
    previewFor: 'معاينة «{pack}» مع «{template}»',
    previewCapabilities: 'القدرات الممنوحة',
    previewLimits: 'حدود الاعتماد',
    previewHidden: 'الأقسام المخفية',
    previewNoCapabilities: 'بدون قدرات إضافية — يُضبط كل شيء في وحدة الصلاحيات.',
    previewNoLimits: 'بدون حدود اعتماد — كل الأفعال غير مقيّدة.',
    previewNoHidden: 'لا أقسام مخفية — كل الأقسام مرئية افتراضياً.',
    previewModulesRoles: '{modules} وحدة · {roles} دور',

    // step 4 — review
    reviewTitle: 'المراجعة والتأكيد',
    reviewHint: 'تحقّق من الإعداد قبل الإنشاء. كل شيء يبقى قابلاً للتعديل في وحدة الصلاحيات بعد الإنشاء.',
    reviewCompany: 'بيانات الشركة',
    reviewPack: 'باقة النشاط',
    reviewModules: 'الوحدات المُفعّلة',
    reviewRoles: 'الأدوار المُنشأة',
    reviewTemplate: 'نموذج الصلاحيات',
    reviewAdmin: 'مدير الشركة',
    reviewAdminCreated: 'سيُنشأ المستخدم بكلمة مرور.',
    reviewAdminInvited: 'سيُدعى عبر البريد الإلكتروني لاحقاً.',
    reviewLimits: 'حدود الاعتماد',
    reviewSections: 'وصول الأقسام',
    reviewSectionsHidden: 'مخفية عن: {roles}',
    reviewScopes: 'النطاقات المُوصى بها',
    reviewHierarchy: 'تسلسل التبعية',
    reviewNoLimits: 'بدون حدود اعتماد.',
    reviewNoSections: 'لا أقسام مخفية.',
    reviewNoScopes: 'بدون نطاقات موصى بها.',
    reviewNoHierarchy: 'بدون تسلسل تبعية.',

    // status / creating
    errorTitle: 'تعذّر إنشاء الشركة',
    errorRetry: 'عُد وأصلح المشكلة ثم أعد المحاولة.',

    // step 6 — success
    successTitle: 'تم إنشاء الشركة بنجاح',
    successSubtitle: 'الشركة جاهزة. تابع الإعداد من إحدى الوجهات أدناه.',
    successAdminCreated: 'تم إنشاء حساب المدير.',
    successAdminInvited: 'سيُدعى المدير عبر البريد الإلكتروني.',
    successRoles: 'الأدوار المُنشأة: {count}',
    successCapabilities: 'الصلاحيات المُطبّقة: {count}',
    successModules: 'الوحدات المُفعّلة: {count}',
    openCompany: 'فتح ملف الشركة 360',
    openAuthz: 'فتح وحدة الصلاحيات',
    createAnother: 'إنشاء شركة أخرى',

    // entry point
    newCompany: 'شركة جديدة',
  },
};

export const en = {
  onboarding: {
    title: 'Onboard a new company',
    description: 'A guided flow to create a company: basics, industry pack, permission template, then review and create.',
    ownerOnly: 'This page is available to the platform owner only.',

    // stepper
    stepBasics: 'Company',
    stepPack: 'Industry Pack',
    stepOrg: 'Org Structure',
    stepTemplate: 'Permissions',
    stepReview: 'Review',
    stepOf: 'Step {current} of {total}',

    // nav
    back: 'Back',
    next: 'Next',
    create: 'Create company with this setup',
    creating: 'Creating company…',

    // step 1 — basics
    basicsTitle: 'Company basics',
    basicsHint: 'The business type is chosen in the next step (the pack).',
    name: 'Company name (English)',
    namePlaceholder: 'Acme Distribution',
    nameRequired: 'Company name is required.',
    nameAr: 'Company name (Arabic)',
    nameArPlaceholder: 'شركة المثال للتوزيع',
    country: 'Country',
    countryPlaceholder: 'Saudi Arabia',
    currency: 'Currency',
    language: 'Language',
    langAr: 'Arabic',
    langEn: 'English',
    timezone: 'Timezone',
    status: 'Status',
    statusTrial: 'Trial',
    statusActive: 'Active',
    statusSuspended: 'Suspended',
    adminSection: 'Company admin',
    adminEmail: 'Admin email',
    adminEmailPlaceholder: 'admin@company.com',
    adminEmailRequired: 'Admin email is required.',
    adminName: 'Admin name',
    adminNamePlaceholder: 'Full name',
    adminPassword: 'Password',
    adminPasswordHint: 'Leave blank to invite by email later.',

    // step 2 — pack
    packTitle: 'Select industry pack',
    packHint: 'The pack shapes the vertical: modules, roles and sensitive sections. Independent from the permission template.',
    packModulesRoles: '{modules} modules · {roles} roles',

    // step 3 — org structure (optional roles + reporting hierarchy)
    orgTitle: 'Organization structure',
    orgHint: 'Choose the roles this company needs. Roles are optional, and the reporting hierarchy adapts to your selection automatically.',
    orgRolesTitle: 'Roles',
    orgRolesHint: 'All roles are selected by default. Company Admin is mandatory and cannot be removed.',
    orgRoleMandatory: 'Mandatory',
    orgHierarchyTitle: 'Reporting hierarchy',
    orgHierarchyHint: 'Reporting hierarchy drives data scope. Branch-specific depth can be set after creation.',
    orgReportsTo: 'reports to',
    orgTopLevel: 'Top level',
    orgRecommendedScope: 'Recommended scope',
    orgAdminRequired: 'Company Admin is required to complete setup.',

    // step 4 — template
    templateTitle: 'Select permission template',
    templateHint: 'The template decides how locked-down it is: granted capabilities, approval limits and hidden sections. Any template combines with any pack.',
    previewTitle: 'Live preview',
    previewFor: 'Preview of “{pack}” with “{template}”',
    previewCapabilities: 'Capabilities granted',
    previewLimits: 'Approval limits',
    previewHidden: 'Hidden sections',
    previewNoCapabilities: 'No extra capabilities — configure everything in the Authz Console.',
    previewNoLimits: 'No approval limits — all actions are unconstrained.',
    previewNoHidden: 'No hidden sections — all sections visible by default.',
    previewModulesRoles: '{modules} modules · {roles} roles',

    // step 4 — review
    reviewTitle: 'Review & confirm',
    reviewHint: 'Check the setup before creating. Everything stays editable in the Authz Console afterwards.',
    reviewCompany: 'Company details',
    reviewPack: 'Industry pack',
    reviewModules: 'Enabled modules',
    reviewRoles: 'Generated roles',
    reviewTemplate: 'Permission template',
    reviewAdmin: 'Admin user',
    reviewAdminCreated: 'User will be created with a password.',
    reviewAdminInvited: 'Will be invited by email later.',
    reviewLimits: 'Approval limits',
    reviewSections: 'Section access',
    reviewSectionsHidden: 'Hidden from: {roles}',
    reviewScopes: 'Recommended scopes',
    reviewHierarchy: 'Reporting hierarchy',
    reviewNoLimits: 'No approval limits.',
    reviewNoSections: 'No hidden sections.',
    reviewNoScopes: 'No recommended scopes.',
    reviewNoHierarchy: 'No reporting hierarchy.',

    // status / creating
    errorTitle: 'Could not create the company',
    errorRetry: 'Go back, fix the issue and try again.',

    // step 6 — success
    successTitle: 'Company created successfully',
    successSubtitle: 'The company is ready. Continue setup from one of the destinations below.',
    successAdminCreated: 'Admin account created.',
    successAdminInvited: 'The admin will be invited by email.',
    successRoles: 'Roles generated: {count}',
    successCapabilities: 'Permissions applied: {count}',
    successModules: 'Modules enabled: {count}',
    openCompany: 'Open Company 360',
    openAuthz: 'Open Authz Console',
    createAnother: 'Create another company',

    // entry point
    newCompany: 'New Company',
  },
};
