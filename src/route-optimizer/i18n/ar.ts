const ar = {
  translation: {
    // ─── التطبيق / العنوان ───────────────────────────────────────────
    app: {
      title: 'JPFOOD محسّن المسارات',
      subtitle: 'تصميم المناطق وتخطيط مسارات السلع الاستهلاكية',
    },
    language: {
      en: 'English',
      uk: 'Українська',
      ar: 'العربية',
      switchLabel: 'اللغة',
    },

    // ─── استيراد البيانات ────────────────────────────────────────────
    import: {
      title: 'استيراد البيانات',
      description:
        'قم بتحميل ملف بيانات العملاء لبدء تخطيط المسارات. يجب أن يحتوي الملف على أكواد العملاء والأسماء والإحداثيات وتكرار الزيارات.',
      dropzoneText: 'اسحب ملف Excel وأفلته هنا، أو انقر للاستعراض',
      supportedFormats: 'الصيغ المدعومة: xlsx.، xls.، csv.',
      fileLoaded: 'تم تحميل الملف بنجاح',
      customersFound: 'تم العثور على {{count}} عميل',
      citiesFound: 'تم العثور على {{count}} مدينة',
      branchesFound: 'تم العثور على {{count}} فرع',
      errors: {
        invalidFile: 'صيغة الملف غير صالحة. يرجى تحميل ملف Excel أو CSV.',
        noCoordinates:
          'لم يتم العثور على بيانات الإحداثيات. تأكد من وجود أعمدة خطوط الطول والعرض.',
        parseError: 'فشل في قراءة الملف. يرجى التحقق من الصيغة والمحاولة مرة أخرى.',
      },
    },

    // ─── نطاق التخطيط ───────────────────────────────────────────────
    scope: {
      title: 'نطاق التخطيط',
      selectCity: 'اختر المدينة',
      selectBranch: 'اختر الفرع',
      allCities: 'جميع المدن',
      allBranches: 'جميع الفروع',
      excludeInactive: 'استبعاد العملاء غير النشطين',
      customersInScope: '{{count}} عميل في النطاق',
    },

    // ─── معايير التحسين ─────────────────────────────────────────────
    params: {
      title: 'معايير التحسين',
      distributionMethod: 'طريقة التوزيع',
      countMode: 'حسب عدد العملاء',
      workloadMode: 'حسب توازن عبء العمل',
      numberOfRoutes: 'عدد المسارات',
      customersPerRoute: 'عدد العملاء لكل مسار',
      workingDaysPerWeek: 'أيام العمل في الأسبوع',
      workingDays: {
        six: '٦ (السبت–الخميس)',
        five: '٥',
        four: '٤',
      },
      avgVisitTime: 'متوسط وقت الزيارة',
      avgVisitTimeUnit: 'دقيقة',
      workingHoursPerDay: 'ساعات العمل في اليوم',
      avgSpeed: 'متوسط سرعة القيادة',
      speedUnit: 'كم/س',
      weeklyFrequencySource: 'مصدر التكرار الأسبوعي',
      automatic: 'تلقائي (من البيانات)',
      uniform: 'موحّد',
      frequencyPerWeek: 'التكرار في الأسبوع',
      outlierIsolationDist: 'مسافة عزل النقاط البعيدة',
      distanceUnit: 'كم',
      createOutstationRoutes: 'إنشاء مسارات خارجية',
      outlierLinkDist: 'مسافة ربط النقاط البعيدة',
      dailyKmCap: 'الحد الأقصى اليومي بالكيلومتر',
      disabledHint: '٠ = معطّل',
      runOptimization: 'تشغيل التحسين',
      optimizing: 'جارٍ التحسين…',
      cancel: 'إلغاء',
    },

    // ─── التقدم ─────────────────────────────────────────────────────
    progress: {
      title: 'تقدم التحسين',
      stepDistributing: 'جارٍ توزيع العملاء على المسارات…',
      stepSequencing: 'جارٍ ترتيب الزيارات اليومية…',
      stepAllocating: 'جارٍ تخصيص الجداول الأسبوعية…',
      stepCalculating: 'جارٍ حساب المسافات والمؤشرات…',
      completed: 'اكتمل التحسين',
    },

    // ─── النتائج – الخريطة ──────────────────────────────────────────
    map: {
      title: 'خريطة المسارات',
      showRoute: 'إظهار المسار',
      hideRoute: 'إخفاء المسار',
      showAll: 'إظهار الكل',
      hideAll: 'إخفاء الكل',
      routeLabel: 'المسار {{number}}',
      customers: 'العملاء',
      depot: 'المستودع',
      outlier: 'نقطة بعيدة',
      outstation: 'نقطة خارجية',
      normalRoute: 'مسار عادي',
      outstationRoute: 'مسار خارجي',
    },

    // ─── النتائج – بطاقات المسارات ──────────────────────────────────
    routeCards: {
      title: 'ملخص المسارات',
      routeNumber: 'المسار {{number}}',
      routeType: 'نوع المسار',
      weeklyKm: 'الكيلومترات الأسبوعية',
      monthlyKm: 'الكيلومترات الشهرية',
      sellingTimeRatio: 'نسبة وقت البيع',
      avgDailyHours: 'متوسط الساعات اليومية',
      dayDetail: {
        dayNumber: 'اليوم {{number}}',
        dayCustomers: '{{count}} عميل',
        dayKm: '{{km}} كم',
        dayHours: '{{hours}} ساعة',
      },
      googleMapsLink: 'فتح في خرائط Google',
      warnings: {
        hoursExceeded: 'تم تجاوز الحد الأقصى للساعات اليومية',
        kmExceeded: 'تم تجاوز الحد الأقصى للكيلومترات اليومية',
        lowSellingTime: 'نسبة وقت البيع أقل من المستهدف',
      },
      normal: 'عادي',
      outstationLabel: 'خارجي',
    },

    // ─── النتائج – جدول الزيارات ────────────────────────────────────
    visitTable: {
      title: 'جدول الزيارات',
      filterByRoute: 'تصفية حسب المسار',
      filterByDay: 'تصفية حسب اليوم',
      allRoutes: 'جميع المسارات',
      allDays: 'جميع الأيام',
      columns: {
        route: 'المسار',
        day: 'اليوم',
        sequence: 'التسلسل',
        customerCode: 'كود العميل',
        customerName: 'اسم العميل',
        city: 'المدينة',
        frequency: 'التكرار',
        latitude: 'خط العرض',
        longitude: 'خط الطول',
      },
      noResults: 'لا توجد نتائج مطابقة للفلاتر الحالية.',
    },

    // ─── النتائج – مؤشرات الأداء ────────────────────────────────────
    kpi: {
      title: 'مؤشرات الأداء الرئيسية',
      totalRoutes: 'إجمالي المسارات',
      distributedCustomers: 'العملاء الموزعون',
      monthlyVisits: 'الزيارات الشهرية',
      monthlyDistance: 'المسافة الشهرية',
      loadBalance: 'توازن الحمل',
      avgSellingTime: 'متوسط وقت البيع',
      unassignedCustomers: 'عملاء غير موزعين',
      overloadedRoutes: 'مسارات محمّلة بشكل زائد',
      commercialRating: 'التقييم التجاري',
      outstationSection: 'المسارات الخارجية',
      needsDecisionSection: 'يحتاج قرار',
      commentary: {
        excellent: 'ممتاز — جميع المسارات ضمن المعايير المستهدفة.',
        good: 'جيد — تعديلات بسيطة قد تحسّن التوازن.',
        acceptable: 'مقبول — راجع المسارات المحمّلة بشكل زائد لإعادة التوازن.',
        poor: 'ضعيف — يُنصح بإعادة توازن جوهرية.',
      },
    },

    // ─── نقاط الانطلاق / المستودع ───────────────────────────────────
    depot: {
      title: 'نقاط الانطلاق',
      enterCoordinates: 'إدخال الإحداثيات',
      clickOnMap: 'النقر على الخريطة',
      selectCustomer: 'اختيار عميل',
      latitude: 'خط العرض',
      longitude: 'خط الطول',
      setDepot: 'تعيين المستودع',
      depotSet: 'تم تعيين المستودع',
      resetDepot: 'إعادة تعيين المستودع',
    },

    // ─── طباعة خطة الرحلات ──────────────────────────────────────────
    print: {
      journeyPlan: 'طباعة خطة الرحلات',
      masterPlan: 'طباعة الخطة الرئيسية',
      printAll: 'طباعة الكل',
      printSelected: 'طباعة المحدد',
      journeyPlanTitle: 'خطة رحلات المندوب',
      masterPlanTitle: 'الخطة الرئيسية للمسارات',
      companyName: 'اسم الشركة',
      salesmanName: 'اسم المندوب',
      salesmanNumber: 'رقم المندوب',
      branch: 'الفرع',
      region: 'المنطقة',
      issueDate: 'تاريخ الإصدار',
      planPeriod: 'فترة الخطة',
      totalCustomers: 'إجمالي العملاء',
      workingDays: 'أيام العمل',
      weeklyVisits: 'الزيارات الأسبوعية',
      startPoint: 'نقطة الانطلاق',
      tableHeaders: {
        seq: 'م',
        customerCode: 'كود العميل',
        customerName: 'اسم العميل',
        cityDistrict: 'المدينة / الحي',
        frequency: 'التكرار',
        done: 'تم',
        notes: 'ملاحظات',
      },
      dayFooter: {
        customersToday: 'عملاء اليوم: {{count}}',
        expectedKm: 'الكيلومترات المتوقعة: {{km}}',
      },
      signatureArea: {
        salesmanSignature: 'توقيع المندوب',
        supervisorSignature: 'توقيع المشرف',
      },
      days: {
        saturday: 'السبت',
        sunday: 'الأحد',
        monday: 'الاثنين',
        tuesday: 'الثلاثاء',
        wednesday: 'الأربعاء',
        thursday: 'الخميس',
      },
    },

    // ─── عام ────────────────────────────────────────────────────────
    common: {
      save: 'حفظ',
      cancel: 'إلغاء',
      close: 'إغلاق',
      export: 'تصدير',
      print: 'طباعة',
      download: 'تحميل',
      loading: 'جارٍ التحميل…',
      error: 'خطأ',
      warning: 'تحذير',
      info: 'معلومة',
      success: 'نجاح',
      yes: 'نعم',
      no: 'لا',
      enabled: 'مفعّل',
      disabled: 'معطّل',
      km: 'كم',
      hours: 'ساعات',
      minutes: 'دقائق',
      perWeek: 'أسبوعياً',
      perMonth: 'شهرياً',
      noData: 'لا توجد بيانات',
      selectOption: 'اختر خياراً',
    },

    // ─── تصدير Excel ────────────────────────────────────────────────
    excel: {
      exportExcel: 'تصدير إلى Excel',
      sheetWeeklyPlan: 'الخطة الأسبوعية',
      sheetRouteSummary: 'ملخص المسارات',
      sheetNeedsDecision: 'يحتاج قرار',
      sheetUnassigned: 'غير موزعين',
    },
  },
} as const;

export default ar;
