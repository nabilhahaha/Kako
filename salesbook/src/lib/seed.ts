// Seed data — ported from SalesBook.dc.html, translated to English alongside
// the original Arabic. Every user-facing value is { ar, en }.
import type {
  Customer, MembershipRequest, ReviewItem, Notif, Post, Job, Talent, Leader,
  ConnReq, Suggest, Chat, ChatMsg, Group, EventItem, Member, L, Bootstrap,
} from './types';

const l = (ar: string, en: string): L => ({ ar, en });

export const CUSTOMERS: Customer[] = [
  {
    id: 'n1', name: l('أسواق النخيل التجارية', 'Al Nakheel Markets'),
    area: l('الرياض · حي العليا', 'Riyadh · Al Olaya'), city: 'الرياض',
    dist: l('3.2 كم', '3.2 km'), distN: 3.2, score: 92, late: false, stale: false, verif: 8,
    ini: 'أش', av: '#E8791A', updBy: l('أحمد الشمري', 'Ahmed Al-Shammari'), updWhen: l('قبل ساعتين', '2h ago'),
    updTxt: l('تم تعيين مسؤول مشتريات جديد — فهد القحطاني', 'New purchasing manager assigned — Fahd Al-Qahtani'), comments: 12,
    chips: [
      { t: l('الدفع: ممتاز', 'Payment: Excellent'), tone: 'g' },
      { t: l('الحركة: سريعة', 'Movement: Fast'), tone: 'b' },
      { t: l('عام: 4.8 ★', 'Overall: 4.8 ★'), tone: 'n' },
    ],
    pay: {
      short: l('ممتاز', 'Excellent'), tone: 'g', delay: l('3 أيام', '3 days'),
      credit: l('45,000 ر.س', 'SAR 45,000'), creditState: l('نشط', 'Active'),
      risk: l('منخفض', 'Low'), riskTone: 'g', light: 'g', reports: 12,
    },
    move: {
      speed: l('سريعة', 'Fast'), days: l('كل 12 يوم', 'every 12 days'), trend: [35, 50, 42, 65, 80, 100],
      cats: [l('شوكولاتة', 'Chocolate'), l('بسكويت', 'Biscuits'), l('مشروبات', 'Beverages')],
      catLine: l('شوكولاتة · بسكويت — الأسرع دورانًا هذا الربع', 'Chocolate · Biscuits — fastest turnover this quarter'),
    },
    avg: l('12,500 ر.س', 'SAR 12,500'), best: l('الثلاثاء · 9–11 صباحًا', 'Tuesday · 9–11 AM'),
    kyc: {
      decision: l('خالد العتيبي', 'Khalid Al-Otaibi'), decisionV: 8, buyer: l('فهد القحطاني', 'Fahd Al-Qahtani'), buyerV: 3,
      fin: l('سعود الحربي', 'Saud Al-Harbi'), finV: 0,
      note: l('يفضّل التنسيق عبر واتساب قبل الزيارة بيوم', 'Prefers coordinating via WhatsApp a day before the visit'),
      updated: l('قبل 3 أيام', '3 days ago'),
    },
    warn: l('لا يتم استلام البضاعة يوم الجمعة', 'Deliveries are not received on Fridays'),
    contacts: [
      { n: l('خالد العتيبي', 'Khalid Al-Otaibi'), ini: 'خع', role: l('المدير العام', 'General Manager'), badge: 'decision', phone: '0555 214 890', v: 8, vBy: l('أحمد الشمري', 'Ahmed Al-Shammari'), vWhen: l('12 يونيو', 'Jun 12'), note: l('يعتمد الكميات الكبيرة بنفسه', 'Approves large quantities himself') },
      { n: l('فهد القحطاني', 'Fahd Al-Qahtani'), ini: 'فق', role: l('مسؤول المشتريات', 'Purchasing Manager'), badge: 'buy', phone: '0554 118 232', v: 3, vBy: l('سارة المطيري', 'Sara Al-Mutairi'), vWhen: l('28 يونيو', 'Jun 28'), note: l('التواصل الأول لأي طلبية', 'First point of contact for any order') },
      { n: l('سعود الحربي', 'Saud Al-Harbi'), ini: 'سح', role: l('المحاسب', 'Accountant'), badge: 'fin', phone: '0556 902 771', v: 0, vBy: l('', ''), vWhen: l('', ''), note: l('لا تُناقش الأسعار معه', 'Do not discuss pricing with him') },
    ],
    notes: [
      { by: l('أحمد الشمري', 'Ahmed Al-Shammari'), ini: 'أش', av: '#E8791A', when: l('قبل ساعتين', '2h ago'), txt: l('تم تعيين مسؤول مشتريات جديد — فهد القحطاني. الكميات الكبيرة تُعتمد من خالد مباشرة.', 'New purchasing manager assigned — Fahd Al-Qahtani. Large quantities are approved directly by Khalid.'), likes: 6, comments: 12, img: false, voice: false, st: 'approved' },
      { by: l('سارة المطيري', 'Sara Al-Mutairi'), ini: 'سم', av: '#12876F', when: l('قبل 3 أيام', '3 days ago'), txt: l('رتّبنا رف العرض الجديد بجانب الكاشير — انطباع المدير ممتاز.', 'We set up the new display shelf next to the cashier — the manager was very impressed.'), likes: 14, comments: 4, img: true, voice: false, st: 'approved' },
      { by: l('نايف الدوسري', 'Nayef Al-Dosari'), ini: 'ند', av: '#1F4E8C', when: l('قبل أسبوع', 'a week ago'), txt: l('ملاحظة صوتية عن مناقشة العروض الموسمية مع خالد.', 'Voice note on discussing seasonal promotions with Khalid.'), likes: 3, comments: 1, img: false, voice: true, st: 'pending' },
    ],
    hist: [
      { f: l('هاتف المشتريات', 'Purchasing phone'), old: l('0554 000 111', '0554 000 111'), nw: l('0554 118 232', '0554 118 232'), by: l('أحمد الشمري', 'Ahmed Al-Shammari'), when: l('2 يوليو · 3:40 م', 'Jul 2 · 3:40 PM'), st: 'approved' },
      { f: l('مسؤول المشتريات', 'Purchasing manager'), old: l('ماجد الشهراني', 'Majed Al-Shahrani'), nw: l('فهد القحطاني', 'Fahd Al-Qahtani'), by: l('أحمد الشمري', 'Ahmed Al-Shammari'), when: l('2 يوليو · 3:38 م', 'Jul 2 · 3:38 PM'), st: 'approved' },
      { f: l('تقييم الدفع', 'Payment rating'), old: l('جيد', 'Good'), nw: l('ممتاز', 'Excellent'), by: l('سارة المطيري', 'Sara Al-Mutairi'), when: l('20 يونيو · 11:05 ص', 'Jun 20 · 11:05 AM'), st: 'approved' },
      { f: l('صور الأرفف', 'Shelf photos'), old: l('3 صور (مارس)', '3 photos (March)'), nw: l('5 صور جديدة', '5 new photos'), by: l('نايف الدوسري', 'Nayef Al-Dosari'), when: l('أمس · 5:22 م', 'Yesterday · 5:22 PM'), st: 'pending' },
    ],
  },
  {
    id: 'n2', name: l('بقالة الواحة', 'Al Waha Grocery'), area: l('جدة · حي الروضة', 'Jeddah · Al Rawdah'), city: 'جدة',
    dist: l('7.8 كم', '7.8 km'), distN: 7.8, score: 61, late: true, stale: false, verif: 3,
    ini: 'سم', av: '#12876F', updBy: l('سارة المطيري', 'Sara Al-Mutairi'), updWhen: l('أمس', 'Yesterday'),
    updTxt: l('تأخر سداد آخر فاتورة، بانتظار تأكيد المالية', 'Last invoice payment delayed, awaiting finance confirmation'), comments: 5,
    chips: [
      { t: l('الدفع: متأخر 14 يوم', 'Payment: 14 days late'), tone: 'o' },
      { t: l('الحركة: متوسطة', 'Movement: Medium'), tone: 'n' },
    ],
    pay: { short: l('متأخر', 'Late'), tone: 'a', delay: l('14 يوم', '14 days'), credit: l('15,000 ر.س', 'SAR 15,000'), creditState: l('قيد المراجعة', 'Under review'), risk: l('متوسط', 'Medium'), riskTone: 'a', light: 'y', reports: 7 },
    move: { speed: l('متوسطة', 'Medium'), days: l('كل 24 يوم', 'every 24 days'), trend: [60, 45, 55, 40, 52, 48], cats: [l('مشروبات', 'Beverages'), l('حلويات', 'Sweets')], catLine: l('مشروبات · حلويات — دوران متوسط', 'Beverages · Sweets — medium turnover') },
    avg: l('4,200 ر.س', 'SAR 4,200'), best: l('السبت · 4–6 مساءً', 'Saturday · 4–6 PM'),
    kyc: { decision: l('عمر باوزير', 'Omar Bawazir'), decisionV: 3, buyer: l('عمر باوزير', 'Omar Bawazir'), buyerV: 3, fin: l('—', '—'), finV: 0, note: l('يطلب فاتورة ورقية مع كل تسليم', 'Requests a paper invoice with every delivery'), updated: l('أمس', 'Yesterday') },
    warn: l('', ''),
    contacts: [
      { n: l('عمر باوزير', 'Omar Bawazir'), ini: 'عب', role: l('المالك', 'Owner'), badge: 'decision', phone: '0503 441 227', v: 3, vBy: l('سارة المطيري', 'Sara Al-Mutairi'), vWhen: l('أمس', 'Yesterday'), note: l('', '') },
    ],
    notes: [
      { by: l('سارة المطيري', 'Sara Al-Mutairi'), ini: 'سم', av: '#12876F', when: l('أمس', 'Yesterday'), txt: l('تأخر سداد آخر فاتورة، بانتظار تأكيد المالية.', 'Last invoice payment delayed, awaiting finance confirmation.'), likes: 2, comments: 5, img: false, voice: false, st: 'approved' },
    ],
    hist: [
      { f: l('تقييم الدفع', 'Payment rating'), old: l('جيد', 'Good'), nw: l('متأخر 14 يوم', '14 days late'), by: l('سارة المطيري', 'Sara Al-Mutairi'), when: l('أمس · 1:12 م', 'Yesterday · 1:12 PM'), st: 'pending' },
    ],
  },
  {
    id: 'n3', name: l('هايبر الأمانة', 'Al Amana Hyper'), area: l('الدمام · حي الشاطئ', 'Dammam · Al Shati'), city: 'الدمام',
    dist: l('11 كم', '11 km'), distN: 11, score: 58, late: false, stale: true, verif: 2,
    ini: 'ند', av: '#1F4E8C', updBy: l('نايف الدوسري', 'Nayef Al-Dosari'), updWhen: l('قبل 3 أشهر', '3 months ago'),
    updTxt: l('بيانات قديمة — يحتاج زيارة تحديث شاملة', 'Outdated data — needs a full update visit'), comments: 2,
    chips: [
      { t: l('بيانات قديمة 94 يوم', 'Data 94 days old'), tone: 'o' },
      { t: l('الحركة: بطيئة', 'Movement: Slow'), tone: 'n' },
    ],
    pay: { short: l('جيد', 'Good'), tone: 'g', delay: l('6 أيام', '6 days'), credit: l('22,000 ر.س', 'SAR 22,000'), creditState: l('نشط', 'Active'), risk: l('متوسط', 'Medium'), riskTone: 'a', light: 'y', reports: 4 },
    move: { speed: l('بطيئة', 'Slow'), days: l('كل 38 يوم', 'every 38 days'), trend: [70, 60, 50, 42, 38, 30], cats: [l('بسكويت', 'Biscuits')], catLine: l('بسكويت — دوران بطيء، يحتاج عرضًا', 'Biscuits — slow turnover, needs a promotion') },
    avg: l('6,800 ر.س', 'SAR 6,800'), best: l('الأحد · 10–12 ظهرًا', 'Sunday · 10–12 noon'),
    kyc: { decision: l('ماجد العنزي', 'Majed Al-Anazi'), decisionV: 2, buyer: l('—', '—'), buyerV: 0, fin: l('—', '—'), finV: 0, note: l('آخر زيارة موثقة قبل 94 يومًا', 'Last documented visit 94 days ago'), updated: l('قبل 94 يوم', '94 days ago') },
    warn: l('أرقام التواصل تحتاج إعادة تحقق', 'Contact numbers need re-verification'),
    contacts: [
      { n: l('ماجد العنزي', 'Majed Al-Anazi'), ini: 'مع', role: l('مدير الفرع', 'Branch Manager'), badge: 'decision', phone: '0508 771 445', v: 2, vBy: l('نايف الدوسري', 'Nayef Al-Dosari'), vWhen: l('قبل 3 أشهر', '3 months ago'), note: l('', '') },
    ],
    notes: [
      { by: l('نايف الدوسري', 'Nayef Al-Dosari'), ini: 'ند', av: '#1F4E8C', when: l('قبل 3 أشهر', '3 months ago'), txt: l('بيانات قديمة — يحتاج زيارة تحديث شاملة.', 'Outdated data — needs a full update visit.'), likes: 1, comments: 2, img: false, voice: false, st: 'approved' },
    ],
    hist: [
      { f: l('صور المتجر', 'Store photos'), old: l('صور يناير', 'January photos'), nw: l('مطلوب تحديث', 'Update required'), by: l('النظام', 'System'), when: l('اليوم', 'Today'), st: 'pending' },
    ],
  },
  {
    id: 'n4', name: l('تموينات البدر', 'Al Badr Supplies'), area: l('الرياض · حي السويدي', 'Riyadh · Al Suwaidi'), city: 'الرياض',
    dist: l('5.4 كم', '5.4 km'), distN: 5.4, score: 34, late: true, stale: false, verif: 4,
    ini: 'إئ', av: '#CC3D3D', updBy: l('إدارة الائتمان', 'Credit Dept.'), updWhen: l('قبل أسبوع', 'a week ago'),
    updTxt: l('تم إيقاف الائتمان لحين سداد المتأخرات', 'Credit suspended until overdue balance is paid'), comments: 9,
    chips: [
      { t: l('ائتمان موقوف', 'Credit suspended'), tone: 'r' },
      { t: l('متأخر +32 يوم', '+32 days late'), tone: 'r' },
    ],
    pay: { short: l('متعثر', 'Defaulting'), tone: 'r', delay: l('+32 يوم', '+32 days'), credit: l('موقوف', 'Suspended'), creditState: l('موقوف', 'Suspended'), risk: l('مرتفع', 'High'), riskTone: 'r', light: 'r', reports: 9 },
    move: { speed: l('بطيئة', 'Slow'), days: l('كل 41 يوم', 'every 41 days'), trend: [55, 48, 40, 30, 22, 15], cats: [l('مشروبات', 'Beverages')], catLine: l('مشروبات — تراجع واضح', 'Beverages — clear decline') },
    avg: l('2,900 ر.س', 'SAR 2,900'), best: l('الاثنين · 9–10 صباحًا', 'Monday · 9–10 AM'),
    kyc: { decision: l('بدر السبيعي', 'Badr Al-Subaie'), decisionV: 4, buyer: l('—', '—'), buyerV: 0, fin: l('—', '—'), finV: 0, note: l('التحصيل قبل أي طلبية جديدة', 'Collect payment before any new order'), updated: l('قبل أسبوع', 'a week ago') },
    warn: l('لا تُصرف طلبات آجلة — نقدي فقط', 'No credit orders — cash only'),
    contacts: [
      { n: l('بدر السبيعي', 'Badr Al-Subaie'), ini: 'بس', role: l('المالك', 'Owner'), badge: 'decision', phone: '0533 219 004', v: 4, vBy: l('إدارة الائتمان', 'Credit Dept.'), vWhen: l('قبل أسبوع', 'a week ago'), note: l('', '') },
    ],
    notes: [
      { by: l('إدارة الائتمان', 'Credit Dept.'), ini: 'إئ', av: '#CC3D3D', when: l('قبل أسبوع', 'a week ago'), txt: l('تم إيقاف الائتمان لحين سداد المتأخرات.', 'Credit suspended until overdue balance is paid.'), likes: 0, comments: 9, img: false, voice: false, st: 'approved' },
    ],
    hist: [
      { f: l('حالة الائتمان', 'Credit status'), old: l('نشط', 'Active'), nw: l('موقوف', 'Suspended'), by: l('إدارة الائتمان', 'Credit Dept.'), when: l('27 يونيو · 9:00 ص', 'Jun 27 · 9:00 AM'), st: 'approved' },
    ],
  },
  {
    id: 'n5', name: l('ماركت الروابي', 'Al Rawabi Market'), area: l('جدة · حي السلامة', 'Jeddah · Al Salamah'), city: 'جدة',
    dist: l('9.1 كم', '9.1 km'), distN: 9.1, score: 78, late: false, stale: false, verif: 5,
    ini: 'عس', av: '#1F4E8C', updBy: l('عبدالله عسيري', 'Abdullah Asiri'), updWhen: l('قبل يومين', '2 days ago'),
    updTxt: l('عرض نهاية الأسبوع حقق مبيعات ممتازة — يطلب تكراره', 'Weekend promotion drove excellent sales — asking to repeat it'), comments: 4,
    chips: [
      { t: l('الدفع: جيد', 'Payment: Good'), tone: 'g' },
      { t: l('الحركة: سريعة', 'Movement: Fast'), tone: 'b' },
    ],
    pay: { short: l('جيد', 'Good'), tone: 'g', delay: l('5 أيام', '5 days'), credit: l('30,000 ر.س', 'SAR 30,000'), creditState: l('نشط', 'Active'), risk: l('منخفض', 'Low'), riskTone: 'g', light: 'g', reports: 6 },
    move: { speed: l('سريعة', 'Fast'), days: l('كل 15 يوم', 'every 15 days'), trend: [40, 55, 50, 70, 85, 95], cats: [l('حلويات', 'Sweets'), l('شوكولاتة', 'Chocolate')], catLine: l('حلويات · شوكولاتة — نمو مستمر', 'Sweets · Chocolate — steady growth') },
    avg: l('8,400 ر.س', 'SAR 8,400'), best: l('الخميس · 5–7 مساءً', 'Thursday · 5–7 PM'),
    kyc: { decision: l('صالح الروقي', 'Saleh Al-Roqi'), decisionV: 5, buyer: l('صالح الروقي', 'Saleh Al-Roqi'), buyerV: 5, fin: l('—', '—'), finV: 0, note: l('متجاوب مع العروض الموسمية', 'Responsive to seasonal promotions'), updated: l('قبل يومين', '2 days ago') },
    warn: l('', ''),
    contacts: [
      { n: l('صالح الروقي', 'Saleh Al-Roqi'), ini: 'صر', role: l('المالك', 'Owner'), badge: 'decision', phone: '0567 320 118', v: 5, vBy: l('عبدالله عسيري', 'Abdullah Asiri'), vWhen: l('قبل يومين', '2 days ago'), note: l('', '') },
    ],
    notes: [
      { by: l('عبدالله عسيري', 'Abdullah Asiri'), ini: 'عس', av: '#1F4E8C', when: l('قبل يومين', '2 days ago'), txt: l('عرض نهاية الأسبوع حقق مبيعات ممتازة — يطلب تكراره.', 'Weekend promotion drove excellent sales — asking to repeat it.'), likes: 9, comments: 4, img: true, voice: false, st: 'approved' },
    ],
    hist: [
      { f: l('متوسط الطلبية', 'Average order'), old: l('6,100 ر.س', 'SAR 6,100'), nw: l('8,400 ر.س', 'SAR 8,400'), by: l('عبدالله عسيري', 'Abdullah Asiri'), when: l('قبل يومين', '2 days ago'), st: 'approved' },
    ],
  },
];

export const REQUESTS: MembershipRequest[] = [
  { id: 'r1', n: l('عبدالعزيز الغامدي', 'Abdulaziz Al-Ghamdi'), ini: 'عغ', co: l('شركة التوزيع الوطنية', 'National Distribution Co.'), job: l('مندوب مبيعات', 'Sales Representative'), phone: '0551 402 998', city: l('الرياض، السعودية', 'Riyadh, Saudi Arabia'), when: l('قبل 20 دقيقة', '20 min ago') },
  { id: 'r2', n: l('محمد الزهراني', 'Mohammed Al-Zahrani'), ini: 'مز', co: l('مؤسسة الخليج للتموين', 'Gulf Supplies Est.'), job: l('مشرف مبيعات', 'Sales Supervisor'), phone: '0549 118 340', city: l('جدة، السعودية', 'Jeddah, Saudi Arabia'), when: l('قبل 3 ساعات', '3h ago') },
  { id: 'r3', n: l('نورة الشهري', 'Noura Al-Shehri'), ini: 'نش', co: l('مؤسسة النخبة الغذائية', 'Elite Foods Est.'), job: l('مديرة منطقة', 'Regional Manager'), phone: '0561 774 205', city: l('الدمام، السعودية', 'Dammam, Saudi Arabia'), when: l('أمس', 'Yesterday') },
];

export const REVIEWS: ReviewItem[] = [
  { id: 'v1', cust: l('أسواق النخيل التجارية', 'Al Nakheel Markets'), field: l('هاتف مسؤول المشتريات', 'Purchasing manager phone'), old: l('0554 000 111', '0554 000 111'), nw: l('0554 118 232', '0554 118 232'), by: l('أحمد الشمري', 'Ahmed Al-Shammari'), when: l('قبل ساعتين', '2h ago'), kind: l('تحديث جهة اتصال', 'Contact update') },
  { id: 'v2', cust: l('بقالة الواحة', 'Al Waha Grocery'), field: l('تقييم الدفع', 'Payment rating'), old: l('جيد · تأخير 6 أيام', 'Good · 6-day delay'), nw: l('متأخر · 14 يوم', 'Late · 14 days'), by: l('سارة المطيري', 'Sara Al-Mutairi'), when: l('أمس', 'Yesterday'), kind: l('تغيير حالة الدفع', 'Payment status change') },
  { id: 'v3', cust: l('هايبر الأمانة', 'Al Amana Hyper'), field: l('جهة اتصال جديدة', 'New contact'), old: l('—', '—'), nw: l('ماجد العنزي · مدير الفرع', 'Majed Al-Anazi · Branch Manager'), by: l('نايف الدوسري', 'Nayef Al-Dosari'), when: l('أمس', 'Yesterday'), kind: l('إضافة مسؤول', 'Add contact') },
];

export const NOTIFS: Notif[] = [
  { sym: '+', tone: 'b', tt: l('طلب عضوية جديد', 'New membership request'), txt: l('عبدالعزيز الغامدي (شركة التوزيع الوطنية) بانتظار الاعتماد', 'Abdulaziz Al-Ghamdi (National Distribution Co.) awaiting approval'), when: l('قبل 20 دقيقة', '20 min ago'), act: 'admin' },
  { sym: '!', tone: 'r', tt: l('تغيّر تقييم الدفع', 'Payment rating changed'), txt: l('تموينات البدر أصبح «مرتفع الخطورة» — أُوقف الائتمان', 'Al Badr Supplies is now "High risk" — credit suspended'), when: l('قبل أسبوع', 'a week ago'), act: 'c:n4' },
  { sym: '@', tone: 'n', tt: l('ذكرك أحمد الشمري', 'Ahmed Al-Shammari mentioned you'), txt: l('في تعليق على ملاحظة أسواق النخيل: «راجع الكميات مع فهد»', 'In a comment on the Al Nakheel note: "Check quantities with Fahd"'), when: l('قبل ساعة', '1h ago'), act: 'c:n1' },
  { sym: '↻', tone: 'o', tt: l('بيانات تحتاج تحديثًا', 'Data needs updating'), txt: l('ملف هايبر الأمانة أقدم من 90 يومًا — جدول زيارة تحقق', 'Al Amana Hyper profile is over 90 days old — schedule a verification visit'), when: l('اليوم', 'Today'), act: 'c:n3' },
  { sym: '✓', tone: 'g', tt: l('تم اعتماد تقريرك', 'Your report was approved'), txt: l('تقريرك عن أسواق النخيل اعتُمد · +15 نقطة سمعة', 'Your Al Nakheel report was approved · +15 reputation points'), when: l('قبل يومين', '2 days ago'), act: 'c:n1' },
  { sym: '◆', tone: 'b', tt: l('دعوة وظيفية', 'Job invitation'), txt: l('مؤسسة الخليج للتموين دعتك للتقدم لوظيفة «مشرف مبيعات — جدة»', 'Gulf Supplies Est. invited you to apply for "Sales Supervisor — Jeddah"'), when: l('اليوم', 'Today'), act: 'careers' },
  { sym: '✎', tone: 'n', tt: l('تحديث حالة التقديم', 'Application status update'), txt: l('وصل طلبك لمرحلة المقابلة — مندوب قنوات التجزئة', 'Your application reached the interview stage — Retail Channels Rep'), when: l('أمس', 'Yesterday'), act: 'careers' },
];

export const REASONS: L[] = [
  l('معلومات غير مكتملة', 'Incomplete information'),
  l('حساب مكرر', 'Duplicate account'),
  l('شركة غير صالحة', 'Invalid company'),
  l('صورة الملف غير واضحة', 'Unclear profile photo'),
  l('سبب آخر', 'Other reason'),
];

export const POSTS: Post[] = [
  { id: 'p0', type: 'post', by: l('يوسف الحربي', 'Youssef Al-Harbi'), ini: 'يح', av: '#1F4E8C', act: l('شارك نصيحة مع المجتمع', 'shared a tip with the community'), cid: 'n1', cust: l('', ''), when: l('قبل 40 دقيقة', '40 min ago'), txt: l('قبل أي زيارة، افتح بطاقة «30 ثانية» واقرأ التحذيرات أولًا — وفّرت عليّ اليوم زيارة كاملة بلا فائدة لأن العميل لا يستلم يوم الجمعة.', 'Before any visit, open the "30-second" card and read the warnings first — it saved me a wasted trip today because the customer doesn’t receive on Fridays.'), kind: l('نصيحة مبيعات', 'Sales tip'), tone: 'b', img: false, voice: false, likes: 24, comments: 7, tags: ['#نصائح_المبيعات', '#التجزئة', '@أسواق_النخيل'] },
  { id: 'p1', type: 'note', by: l('أحمد الشمري', 'Ahmed Al-Shammari'), ini: 'أش', av: '#E8791A', act: l('حدّث جهة اتصال في', 'updated a contact at'), cid: 'n1', cust: l('أسواق النخيل التجارية', 'Al Nakheel Markets'), when: l('قبل ساعتين', '2h ago'), txt: l('تم تعيين فهد القحطاني مسؤولًا للمشتريات — الكميات الكبيرة تُعتمد من خالد مباشرة.', 'Fahd Al-Qahtani was appointed purchasing manager — large quantities are approved directly by Khalid.'), kind: l('تحديث موثق ×8', 'Verified update ×8'), tone: 'g', img: false, voice: false, likes: 6, comments: 12 },
  { id: 'p2', type: 'pay', by: l('سارة المطيري', 'Sara Al-Mutairi'), ini: 'سم', av: '#12876F', act: l('غيّرت تقييم الدفع لـ', 'changed the payment rating for'), cid: 'n2', cust: l('بقالة الواحة', 'Al Waha Grocery'), when: l('أمس', 'Yesterday'), txt: l('تأخر سداد آخر فاتورة 14 يومًا — بانتظار تأكيد المالية قبل الطلبية القادمة.', 'Last invoice is 14 days overdue — awaiting finance confirmation before the next order.'), kind: l('جيد ← متأخر', 'Good ← Late'), tone: 'o', img: false, voice: false, likes: 3, comments: 5 },
  { id: 'p3', type: 'media', by: l('عبدالله عسيري', 'Abdullah Asiri'), ini: 'عس', av: '#1F4E8C', act: l('أضاف 3 صور إلى', 'added 3 photos to'), cid: 'n5', cust: l('ماركت الروابي', 'Al Rawabi Market'), when: l('قبل يومين', '2 days ago'), txt: l('تنفيذ عرض نهاية الأسبوع — النتيجة ممتازة ويطلب تكراره.', 'Weekend promotion execution — excellent result, asking to repeat it.'), kind: l('صور جديدة', 'New photos'), tone: 'b', img: true, voice: false, likes: 9, comments: 4 },
  { id: 'p4', type: 'reminder', by: l('التذكيرات الذكية', 'Smart Reminders'), ini: 'ت', av: '#8695A8', act: l('تذكير بشأن', 'reminder about'), cid: 'n3', cust: l('هايبر الأمانة', 'Al Amana Hyper'), when: l('اليوم', 'Today'), txt: l('بيانات العميل أقدم من 90 يومًا — تُقترح زيارة تحقق هذا الأسبوع.', 'Customer data is over 90 days old — a verification visit is suggested this week.'), kind: l('يحتاج تحديث', 'Needs update'), tone: 'a', img: false, voice: false, likes: 1, comments: 2 },
  { id: 'p5', type: 'pay', by: l('إدارة الائتمان', 'Credit Dept.'), ini: 'إئ', av: '#CC3D3D', act: l('أوقفت ائتمان', 'suspended credit for'), cid: 'n4', cust: l('تموينات البدر', 'Al Badr Supplies'), when: l('قبل أسبوع', 'a week ago'), txt: l('إيقاف الصرف الآجل لحين سداد المتأخرات (+32 يوم).', 'Credit orders halted until the overdue balance is paid (+32 days).'), kind: l('قرار ائتماني', 'Credit decision'), tone: 'r', img: false, voice: false, likes: 0, comments: 9 },
  { id: 'p6', type: 'media', by: l('نايف الدوسري', 'Nayef Al-Dosari'), ini: 'ند', av: '#1F4E8C', act: l('أضاف ملاحظة صوتية عن', 'added a voice note about'), cid: 'n1', cust: l('أسواق النخيل التجارية', 'Al Nakheel Markets'), when: l('قبل أسبوع', 'a week ago'), txt: l('', ''), kind: l('ملاحظة صوتية', 'Voice note'), tone: 'n', img: false, voice: true, likes: 3, comments: 1 },
];

export const JOBS: Job[] = [
  { id: 'j1', t: l('مندوب مبيعات — قنوات التجزئة', 'Sales Rep — Retail Channels'), co: l('شركة التوزيع الوطنية', 'National Distribution Co.'), ini: 'تو', city: l('الرياض', 'Riyadh'), sal: l('6,500–8,000 ر.س + عمولة', 'SAR 6,500–8,000 + commission'), tags: [l('خبرة 2+ سنوات', '2+ years experience'), l('رخصة وسيارة', 'License & car'), l('تفرغ كامل', 'Full-time')], when: l('قبل يومين', '2 days ago'), hot: true },
  { id: 'j2', t: l('مشرف مبيعات', 'Sales Supervisor'), co: l('مؤسسة الخليج للتموين', 'Gulf Supplies Est.'), ini: 'خل', city: l('جدة', 'Jeddah'), sal: l('9,000–11,000 ر.س', 'SAR 9,000–11,000'), tags: [l('خبرة 4+ سنوات', '4+ years experience'), l('إدارة فريق', 'Team management')], when: l('قبل 3 أيام', '3 days ago'), hot: false },
  { id: 'j3', t: l('مدير مبيعات منطقة', 'Regional Sales Manager'), co: l('مؤسسة النخبة الغذائية', 'Elite Foods Est.'), ini: 'نخ', city: l('الدمام', 'Dammam'), sal: l('14,000 ر.س + بدلات', 'SAR 14,000 + allowances'), tags: [l('خبرة 6+ سنوات', '6+ years experience'), l('قطاع الأغذية', 'Food sector')], when: l('قبل أسبوع', 'a week ago'), hot: false },
];

export const TALENTS: Talent[] = [
  { n: l('يوسف الحربي', 'Youssef Al-Harbi'), ini: 'يح', exp: l('خبرة 5 سنوات · قنوات التجزئة والجملة', '5 years · retail & wholesale channels'), city: l('الرياض', 'Riyadh'), pts: '1,580', tags: [l('سيارة خاصة', 'Own car'), l('رخصة سارية', 'Valid license'), l('متاح فورًا', 'Available now')] },
  { n: l('ريم القحطاني', 'Reem Al-Qahtani'), ini: 'رق', exp: l('خبرة 3 سنوات · هايبر ماركت', '3 years · hypermarket'), city: l('جدة', 'Jeddah'), pts: '1,210', tags: [l('رخصة سارية', 'Valid license'), l('متاحة خلال شهر', 'Available within a month')] },
  { n: l('تركي العتيبي', 'Turki Al-Otaibi'), ini: 'تع', exp: l('خبرة 7 سنوات · مشرف سابق', '7 years · former supervisor'), city: l('الدمام', 'Dammam'), pts: '1,975', tags: [l('سيارة خاصة', 'Own car'), l('قيادة فريق', 'Team leadership')] },
];

export const LEADERS: Leader[] = [
  { r: '1', n: l('تركي العتيبي', 'Turki Al-Otaibi'), ini: 'تع', sub: l('النخبة الغذائية · الدمام', 'Elite Foods · Dammam'), pts: '1,975', me: false },
  { r: '2', n: l('يوسف الحربي', 'Youssef Al-Harbi'), ini: 'يح', sub: l('التوزيع الوطنية · الرياض', 'National Distribution · Riyadh'), pts: '1,580', me: false },
  { r: '3', n: l('أحمد الشمري', 'Ahmed Al-Shammari'), ini: 'أش', sub: l('أنت · التوزيع الوطنية', 'You · National Distribution'), pts: '1,240', me: true },
  { r: '4', n: l('ريم القحطاني', 'Reem Al-Qahtani'), ini: 'رق', sub: l('الخليج للتموين · جدة', 'Gulf Supplies · Jeddah'), pts: '1,210', me: false },
  { r: '5', n: l('سارة المطيري', 'Sara Al-Mutairi'), ini: 'سم', sub: l('التوزيع الوطنية · جدة', 'National Distribution · Jeddah'), pts: '1,105', me: false },
  { r: '6', n: l('نايف الدوسري', 'Nayef Al-Dosari'), ini: 'ند', sub: l('التوزيع الوطنية · الدمام', 'National Distribution · Dammam'), pts: '980', me: false },
];

export const CONNREQS: ConnReq[] = [
  { id: 'q1', n: l('ريم القحطاني', 'Reem Al-Qahtani'), ini: 'رق', av: '#12876F', sub: l('مندوبة مبيعات · الخليج للتموين · جدة', 'Sales Rep · Gulf Supplies · Jeddah'), mut: l('4 معارف مشتركون', '4 mutual connections') },
  { id: 'q2', n: l('تركي العتيبي', 'Turki Al-Otaibi'), ini: 'تع', av: '#E8791A', sub: l('مشرف مبيعات · النخبة الغذائية · الدمام', 'Sales Supervisor · Elite Foods · Dammam'), mut: l('12 معرفة مشتركة', '12 mutual connections') },
];

export const SUGGEST: Suggest[] = [
  { n: l('يوسف الحربي', 'Youssef Al-Harbi'), ini: 'يح', av: '#1F4E8C', sub: l('مندوب أول · التوزيع الوطنية · الرياض', 'Senior Rep · National Distribution · Riyadh'), mut: l('8 معارف مشتركون', '8 mutual connections'), member: true },
  { n: l('فيصل الدوسري', 'Faisal Al-Dosari'), ini: 'فد', av: '#12876F', sub: l('مندوب جملة · الرياض', 'Wholesale Rep · Riyadh'), mut: l('5 معارف مشتركون', '5 mutual connections'), member: false },
  { n: l('هند العمري', 'Hind Al-Omari'), ini: 'هع', av: '#E8791A', sub: l('مديرة حسابات رئيسية · جدة', 'Key Accounts Manager · Jeddah'), mut: l('3 معارف مشتركون', '3 mutual connections'), member: false },
];

export const CHATS: Chat[] = [
  { id: 't1', n: l('يوسف الحربي', 'Youssef Al-Harbi'), ini: 'يح', av: '#1F4E8C', last: l('تمام — أمرّ عليه بكرة الصباح', 'Great — I’ll drop by tomorrow morning'), when: l('9:12', '9:12'), unread: 2, online: true },
  { id: 't2', n: l('سارة المطيري', 'Sara Al-Mutairi'), ini: 'سم', av: '#12876F', last: l('تم اعتماد تقريرك عن الواحة', 'Your Al Waha report was approved'), when: l('أمس', 'Yesterday'), unread: 0, online: false },
  { id: 't3', n: l('فريق الرياض — التجزئة', 'Riyadh Team — Retail'), ini: 'فر', av: '#E8791A', last: l('نايف: اجتماع الأحد 9 صباحًا', 'Nayef: Sunday meeting at 9 AM'), when: l('أمس', 'Yesterday'), unread: 0, online: false },
];

export const CHATSEED: ChatMsg[] = [
  { me: false, t: l('صباح الخير أحمد — عندك خلفية عن أسواق النخيل؟ عندي زيارة بكرة الصباح', 'Morning Ahmed — got any background on Al Nakheel? I have a visit tomorrow morning'), when: l('9:05', '9:05') },
  { me: true, t: l('هلا يوسف — حدّثنا ملفه قبل يومين. أرسل لك بطاقة العميل الآن', 'Hi Youssef — we updated their profile two days ago. Sending you the customer card now'), when: l('9:07', '9:07'), read: true },
  { me: true, kind: 'cust', when: l('9:08', '9:08'), read: true },
  { me: false, kind: 'voice', when: l('9:10', '9:10') },
  { me: false, t: l('وصلت البطاقة — وانتبهت لتحذير الجمعة، ممتاز', 'Got the card — noticed the Friday warning, perfect'), when: l('9:12', '9:12') },
];

export const GROUPS: Group[] = [
  { id: 'g1', n: l('مبيعات FMCG السعودية', 'Saudi FMCG Sales'), ini: 'إف', tone: 'b', mem: l('4,218 عضو', '4,218 members'), act: l('32 منشورًا هذا الأسبوع', '32 posts this week') },
  { id: 'g2', n: l('التجارة الحديثة والهايبر', 'Modern Trade & Hyper'), ini: 'تح', tone: 'g', mem: l('1,905 عضو', '1,905 members'), act: l('11 منشورًا هذا الأسبوع', '11 posts this week') },
  { id: 'g3', n: l('مجتمع الجملة والتوزيع', 'Wholesale & Distribution'), ini: 'جت', tone: 'o', mem: l('2,640 عضو', '2,640 members'), act: l('19 منشورًا هذا الأسبوع', '19 posts this week') },
];

export const EVENTS: EventItem[] = [
  { id: 'e1', d: '12', m: l('يوليو', 'Jul'), t: l('تدريب: مهارات التفاوض مع المشترين', 'Training: Negotiation skills with buyers'), by: l('التوزيع الوطنية · الرياض', 'National Distribution · Riyadh'), kind: l('تدريب', 'Training'), tone: 'b', going: l('46 مشاركًا', '46 attending') },
  { id: 'e2', d: '18', m: l('يوليو', 'Jul'), t: l('إطلاق تشكيلة الشوكولاتة الجديدة', 'New chocolate range launch'), by: l('النخبة الغذائية · عن بُعد', 'Elite Foods · Remote'), kind: l('إطلاق منتج', 'Product launch'), tone: 'o', going: l('120 مشاركًا', '120 attending') },
  { id: 'e3', d: '25', m: l('يوليو', 'Jul'), t: l('ورشة: التنفيذ في التجارة الحديثة', 'Workshop: Execution in modern trade'), by: l('مجموعة FMCG · جدة', 'FMCG Group · Jeddah'), kind: l('ورشة عمل', 'Workshop'), tone: 'g', going: l('58 مشاركًا', '58 attending') },
];

export const MEMBER: Member = {
  n: l('يوسف الحربي', 'Youssef Al-Harbi'), ini: 'يح', av: '#1F4E8C',
  title: l('مندوب مبيعات أول · شركة التوزيع الوطنية', 'Senior Sales Rep · National Distribution Co.'),
  city: l('الرياض، السعودية', 'Riyadh, Saudi Arabia'), mut: l('8 معارف مشتركون', '8 mutual connections'), pts: '1,580', conns: '240+',
  about: l('مندوب أول بخبرة 5 سنوات في قنوات التجزئة والجملة بالرياض — متخصص في تنفيذ العروض وإدارة الأرفف وبناء علاقات موثوقة مع المتاجر.', 'Senior rep with 5 years across retail and wholesale channels in Riyadh — specialized in promotion execution, shelf management, and building trusted store relationships.'),
  exp: [
    { r: l('مندوب مبيعات أول', 'Senior Sales Rep'), co: l('شركة التوزيع الوطنية', 'National Distribution Co.'), per: l('2023 — الآن', '2023 — Present') },
    { r: l('مندوب مبيعات', 'Sales Rep'), co: l('مؤسسة الخليج للتموين', 'Gulf Supplies Est.'), per: l('2020 — 2023', '2020 — 2023') },
  ],
  skills: [l('التجزئة', 'Retail'), l('الجملة', 'Wholesale'), l('التفاوض', 'Negotiation'), l('تنفيذ العروض', 'Promotion execution'), l('إدارة الأرفف', 'Shelf management'), l('التحصيل', 'Collections')],
  certs: [l('شهادة المبيعات الاحترافية CPS — 2024', 'Certified Professional Sales (CPS) — 2024')],
};

export const bootstrap = (): Bootstrap => ({
  customers: CUSTOMERS, requests: REQUESTS, reviews: REVIEWS, notifs: NOTIFS, posts: POSTS,
  jobs: JOBS, talents: TALENTS, leaders: LEADERS, connreqs: CONNREQS, suggest: SUGGEST,
  chats: CHATS, chatseed: CHATSEED, groups: GROUPS, events: EVENTS, member: MEMBER, reasons: REASONS,
});
