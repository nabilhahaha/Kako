# متتبع زيارات السوق (Market Visits Tracker)

أداة ويب **مستقلة تماماً** لتسجيل زيارات السوق ومتابعة الأداء — منفصلة عن FieldSync.

- **التقنية:** React 18 + TypeScript + Vite + Tailwind
- **التخزين:** Supabase (جدول `mv_visits` في مشروع `field-insights`)
- **عربي RTL** ومناسب للموبايل

## المؤشرات
| المؤشر | المعنى |
|---|---|
| إجمالي الزيارات | عدد كل الزيارات المسجّلة |
| معدل التحول (Strike Rate) | نسبة الزيارات التي نتج عنها طلب |
| متوسط الطلب (Drop Size) | متوسط قيمة الطلب للزيارات التي فيها طلب |
| زيارات اليوم | عدد زيارات النهاردة |

## التشغيل
```bash
cd market-visits
npm install
cp .env.example .env   # القيم جاهزة بالفعل
npm run dev            # http://localhost:5173
```

## قاعدة البيانات
الجدول `public.mv_visits` متعمل بالفعل في مشروع `field-insights` (Supabase) عبر migration:

```sql
create table public.mv_visits (
  id          uuid primary key default gen_random_uuid(),
  shop_name   text not null,
  area        text,
  visited_at  timestamptz not null default now(),
  had_order   boolean not null default false,
  order_value numeric(12,2) not null default 0,
  notes       text,
  created_at  timestamptz not null default now()
);
```

## ملاحظة أمان
الأداة مضبوطة كأداة شخصية: مفتاح `publishable` (anon) عنده صلاحية قراءة/كتابة على
جدول `mv_visits` فقط. لو عايزها متعددة المستخدمين أو بيانات خاصة لكل شخص، ضيف
تسجيل دخول Supabase Auth واربط الصفوف بـ `user_id` عبر RLS.
