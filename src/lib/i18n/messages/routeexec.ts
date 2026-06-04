/** Route execution ("My Day"). ar = source of truth; en mirrors EXACTLY
 *  (i18n parity test enforces identical keys). */
export const ar = {
  routeexec: {
    title: 'تنفيذ خط السير',
    subtitle: 'يومك في شاشة واحدة — الإنجاز والعميل التالي والإجراءات.',
    openJourney: 'افتح رحلة اليوم (تسجيل الوصول)',
    completion: 'نسبة الإنجاز',
    gpsCompliance: 'التزام GPS',
    missed: 'متبقّي',
    health: 'صحة الخط',
    nextCustomer: 'العميل التالي',
    routeComplete: 'اكتمل خط سير اليوم — عمل رائع!',
    checkIn: 'تسجيل الوصول',
    plannedAt: 'الموعد:',
    stops: 'المحطات',
    visited: 'تمت الزيارة',
    pending: 'بانتظار',
    noRoute: 'لا يوجد خط سير لليوم.',
    noRouteNote: 'تظهر محطات اليوم هنا عند توفّر خطة الزيارات.',
  },
};

export const en = {
  routeexec: {
    title: 'Route Execution',
    subtitle: 'Your day in one screen — completion, next customer, actions.',
    openJourney: "Open today's journey (check-in)",
    completion: 'Completion',
    gpsCompliance: 'GPS compliance',
    missed: 'Remaining',
    health: 'Route health',
    nextCustomer: 'Next customer',
    routeComplete: "Today's route is complete — great work!",
    checkIn: 'Check in',
    plannedAt: 'Planned:',
    stops: 'Stops',
    visited: 'Visited',
    pending: 'Pending',
    noRoute: 'No route for today.',
    noRouteNote: "Today's stops appear here once a journey plan is available.",
  },
};
