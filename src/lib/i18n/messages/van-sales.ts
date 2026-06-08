/** Van Sales Mobile Control (Phase A) — salesman "My Day" shell. ar = source of
 *  truth; en mirrors. Flag-gated (KAKO_VAN_SALES). */
export const ar = {
  vanSales: {
    myDayTitle: 'يومي — مبيعات الشاحنة',
    myDaySubtitle: 'ابدأ يومك، نفّذ خط سيرك، ثم أغلق اليوم.',
    state: {
      not_started: 'لم يبدأ اليوم',
      open: 'اليوم مفتوح',
      closed: 'تم إغلاق اليوم',
    },
    start: 'ابدأ اليوم',
    endDay: 'إنهاء اليوم',
    comingSoon: 'قريبًا',
    steps: {
      confirmLoad: 'تأكيد تحميل الشاحنة',
      journey: 'خط السير / الخريطة',
      route: 'نظرة يومي',
      sell: 'بيع',
      collect: 'تحصيل',
      stock: 'مخزون الشاحنة',
      reconcile: 'تسوية اليوم',
      merchandising: 'التسويق الميداني',
      offline: 'قائمة المزامنة',
    },
  },
};

export const en = {
  vanSales: {
    myDayTitle: 'My Day — Van Sales',
    myDaySubtitle: 'Start your day, run your route, then close the day.',
    state: {
      not_started: 'Day not started',
      open: 'Day open',
      closed: 'Day closed',
    },
    start: 'Start Day',
    endDay: 'End Day',
    comingSoon: 'Coming soon',
    steps: {
      confirmLoad: 'Confirm Van Load',
      journey: 'Journey / Map',
      route: 'My Day overview',
      sell: 'Sell',
      collect: 'Collect',
      stock: 'Van Stock',
      reconcile: 'Day reconciliation',
      merchandising: 'Merchandising',
      offline: 'Sync queue',
    },
  },
};
