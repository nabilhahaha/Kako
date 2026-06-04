/** VANTORA Help Copilot — UI chrome strings (the global floating help assistant
 *  and the Confusion-Analytics dashboard). These are CHROME labels only; the
 *  deterministic engine returns already-localized content given the `locale`
 *  argument, so nothing here duplicates engine output. ar = source of truth; en
 *  mirrors EXACTLY (the i18n parity test enforces identical key paths). */
export const ar = {
  copilot: {
    // ── Floating assistant (FAB + panel) ──
    open: 'المساعد',
    openAria: 'فتح مساعد المساعدة',
    close: 'إغلاق',
    title: 'مساعد VANTORA',
    subtitle: 'مساعدة فورية حسب صفحتك ودورك.',

    // tabs
    tabScreen: 'هذه الصفحة',
    tabNow: 'ماذا أفعل الآن؟',
    tabWhy: 'لماذا لا أستطيع…؟',
    tabLearn: 'تعلّم',

    // This-screen tab
    screenActions: 'ما يمكنك فعله هنا',
    screenQuestions: 'أسئلة شائعة',
    noScreenHelp: 'لا توجد مساعدة مخصصة لهذه الصفحة بعد.',

    // What-should-I-do-now tab
    nowEmpty: 'لا شيء يحتاج انتباهك الآن. عمل رائع!',
    nowOpen: 'فتح',

    // Why-can't-I tab
    whyPick: 'اختر إجراءً لمعرفة سبب حظره:',
    whyAllowed: 'هذا الإجراء متاح لك حالياً.',
    whyRemedy: 'الحل',
    whyReasons: 'الأسباب',

    // Learn tab
    learnPick: 'اختر موضوعاً لعرض الخطوات:',
    learnSteps: 'الخطوات',
    learnNotPermitted: 'دورك الحالي قد لا يسمح بهذا الإجراء، لكن يمكنك معرفة كيفية عمله.',

    loading: 'جارٍ التحميل…',
    error: 'تعذّر تحميل المساعدة. حاول مرة أخرى.',

    // ── Confusion analytics dashboard (F16) ──
    analyticsTitle: 'تحليلات الالتباس',
    analyticsDescription: 'الأسئلة الأكثر طرحاً والشاشات الأكثر إرباكاً وأسباب الحظر الشائعة — لتحسين تجربة فريقك.',
    analyticsAdminOnly: 'هذه الصفحة متاحة لمدير الشركة أو مالك المنصّة فقط.',
    analyticsEmpty: 'لا توجد بيانات بعد. ستظهر هنا بمجرد استخدام الفريق للمساعد.',
    blockedRate: 'نسبة المحظور',
    totalQueries: 'إجمالي الاستفسارات',
    topActions: 'الإجراءات الأكثر سؤالاً',
    topScreens: 'الشاشات الأكثر إرباكاً',
    topReasons: 'أسباب الحظر الأكثر شيوعاً',
    byType: 'الحجم حسب النوع',
    count: 'العدد',

    // query-type labels
    typeScreenHelp: 'مساعدة الصفحة',
    typeWhyBlocked: 'لماذا محظور',
    typeNextBestAction: 'الإجراء التالي',
    typeTraining: 'التدريب',
    typePermissionExplain: 'شرح الصلاحية',
    typeWorkflowStatus: 'حالة سير العمل',
    typeQuickHelp: 'مساعدة سريعة',

    // ── Ask Copilot (AI-optional prototype; deterministic by default) ──
    ask: 'اسأل المساعد',
    askTitle: 'اسأل المساعد',
    askDescription: 'اكتب سؤالك بالعربية أو الإنجليزية — يجيب المساعد من دورك وصلاحياتك الحالية.',
    askPlaceholder: 'مثال: لماذا لا أستطيع إضافة عميل؟',
    askSend: 'اسأل',
    askThinking: 'جارٍ التفكير…',
    askEmpty: 'اكتب سؤالاً للبدء.',
    askTryThese: 'جرّب هذه الأسئلة:',
    askDeterministicNote: 'يعمل المساعد بمحرك المساعدة المدمج (بدون ذكاء اصطناعي خارجي).',
    askErrorEmpty: 'اكتب سؤالاً أولاً.',
    askError: 'تعذّرت الإجابة. حاول مرة أخرى.',
  },
};

export const en = {
  copilot: {
    // ── Floating assistant (FAB + panel) ──
    open: 'Help',
    openAria: 'Open help assistant',
    close: 'Close',
    title: 'VANTORA Copilot',
    subtitle: 'Instant help for your screen and role.',

    // tabs
    tabScreen: 'This screen',
    tabNow: 'What should I do now?',
    tabWhy: 'Why can’t I…?',
    tabLearn: 'Learn',

    // This-screen tab
    screenActions: 'What you can do here',
    screenQuestions: 'Common questions',
    noScreenHelp: 'No tailored help for this screen yet.',

    // What-should-I-do-now tab
    nowEmpty: 'Nothing needs your attention right now. Great job!',
    nowOpen: 'Open',

    // Why-can't-I tab
    whyPick: 'Pick an action to see why it’s blocked:',
    whyAllowed: 'This action is available to you right now.',
    whyRemedy: 'Fix',
    whyReasons: 'Reasons',

    // Learn tab
    learnPick: 'Pick a topic to see the steps:',
    learnSteps: 'Steps',
    learnNotPermitted: 'Your current role may not allow this, but here’s how it works.',

    loading: 'Loading…',
    error: 'Could not load help. Try again.',

    // ── Confusion analytics dashboard (F16) ──
    analyticsTitle: 'Confusion Analytics',
    analyticsDescription: 'Most-asked questions, most confusing screens, and common block reasons — to improve your team’s experience.',
    analyticsAdminOnly: 'This page is available to Company Admins and the Platform Owner only.',
    analyticsEmpty: 'No data yet. Insights appear here once your team uses the assistant.',
    blockedRate: 'Blocked rate',
    totalQueries: 'Total queries',
    topActions: 'Most-asked actions',
    topScreens: 'Most confusing screens',
    topReasons: 'Most common block reasons',
    byType: 'Volume by type',
    count: 'Count',

    // query-type labels
    typeScreenHelp: 'Screen help',
    typeWhyBlocked: 'Why blocked',
    typeNextBestAction: 'Next best action',
    typeTraining: 'Training',
    typePermissionExplain: 'Permission explain',
    typeWorkflowStatus: 'Workflow status',
    typeQuickHelp: 'Quick help',

    // ── Ask Copilot (AI-optional prototype; deterministic by default) ──
    ask: 'Ask Copilot',
    askTitle: 'Ask Copilot',
    askDescription: 'Type your question in Arabic or English — the assistant answers from your current role and permissions.',
    askPlaceholder: 'e.g., Why can’t I add a customer?',
    askSend: 'Ask',
    askThinking: 'Thinking…',
    askEmpty: 'Type a question to begin.',
    askTryThese: 'Try these questions:',
    askDeterministicNote: 'Powered by the built-in help engine (no external AI).',
    askErrorEmpty: 'Type a question first.',
    askError: 'Could not answer. Try again.',
  },
};
