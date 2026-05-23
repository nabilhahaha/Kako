import { create } from 'zustand';

export type Lang = 'en' | 'uk';

interface LangStore {
  lang: Lang;
  setLang: (lang: Lang) => void;
  toggle: () => void;
}

export const useLangStore = create<LangStore>((set) => ({
  lang: 'en',
  setLang: (lang) => set({ lang }),
  toggle: () => set((s) => ({ lang: s.lang === 'en' ? 'uk' : 'en' })),
}));

const translations: Record<string, Record<Lang, string>> = {
  'Sales Dashboard': { en: 'Sales Dashboard', uk: 'Панель продажів' },
  'Overview': { en: 'Overview', uk: 'Огляд' },
  'Trend': { en: 'Trend', uk: 'Тренд' },
  'Geography': { en: 'Geography', uk: 'Географія' },
  'Customers': { en: 'Customers', uk: 'Клієнти' },
  'Products': { en: 'Products', uk: 'Продукція' },
  'Sales Team': { en: 'Sales Team', uk: 'Команда продажів' },
  'Returns': { en: 'Returns', uk: 'Повернення' },
  'Risks': { en: 'Risks', uk: 'Ризики' },
  'Lost': { en: 'Lost', uk: 'Втрачені' },
  'Profiles': { en: 'Profiles', uk: 'Профілі' },
  'Promo': { en: 'Promo', uk: 'Промо' },
  'Invoice 360': { en: 'Invoice 360', uk: 'Рахунок 360' },
  'Print': { en: 'Print', uk: 'Друк' },
  'Upload Excel': { en: 'Upload Excel', uk: 'Завантажити Excel' },
  'Total Sales': { en: 'Total Sales', uk: 'Загальні продажі' },
  'Return Rate': { en: 'Return Rate', uk: 'Рівень повернень' },
  'Active Customers': { en: 'Active Customers', uk: 'Активні клієнти' },
  'Active SKUs': { en: 'Active SKUs', uk: 'Активні SKU' },
  'Salesmen': { en: 'Salesmen', uk: 'Продавці' },
  'Transactions': { en: 'Transactions', uk: 'Транзакції' },
  'Avg Order Value': { en: 'Avg Order Value', uk: 'Середній чек' },
  'Region': { en: 'Region', uk: 'Регіон' },
  'Channel': { en: 'Channel', uk: 'Канал' },
  'Branch': { en: 'Branch', uk: 'Філія' },
  'Category': { en: 'Category', uk: 'Категорія' },
  'Manager': { en: 'Manager', uk: 'Менеджер' },
  'Clear all': { en: 'Clear all', uk: 'Очистити все' },
  'Sales (SAR)': { en: 'Sales (SAR)', uk: 'Продажі (SAR)' },
  'Share': { en: 'Share', uk: 'Частка' },
  'Qty': { en: 'Qty', uk: 'К-сть' },
  'Orders': { en: 'Orders', uk: 'Замовлення' },
  'Customer': { en: 'Customer', uk: 'Клієнт' },
  'Salesman': { en: 'Salesman', uk: 'Продавець' },
  'Name': { en: 'Name', uk: 'Назва' },
  'Value': { en: 'Value', uk: 'Вартість' },
  'Cases': { en: 'Cases', uk: 'Ящики' },
  'Monthly Sales Trend': { en: 'Monthly Sales Trend', uk: 'Місячний тренд продажів' },
  'Revenue by Region': { en: 'Revenue by Region', uk: 'Дохід за регіоном' },
  'Sales by Channel': { en: 'Sales by Channel', uk: 'Продажі за каналом' },
  'Sales vs Returns': { en: 'Sales vs Returns', uk: 'Продажі vs Повернення' },
  'Loading Sales Data': { en: 'Loading Sales Data', uk: 'Завантаження даних...' },
  'Welcome to Roshen KSA Dashboard': { en: 'Welcome to Roshen KSA Dashboard', uk: 'Ласкаво просимо до Roshen KSA' },
  'rows': { en: 'rows', uk: 'рядків' },
  'salesmen': { en: 'salesmen', uk: 'продавців' },
  'customers': { en: 'customers', uk: 'клієнтів' },
  'Sort by Revenue': { en: 'Sort by Revenue', uk: 'За доходом' },
  'Sort by Orders': { en: 'Sort by Orders', uk: 'За замовленнями' },
  'Sort by Quantity': { en: 'Sort by Quantity', uk: 'За кількістю' },
  'active customers': { en: 'active customers', uk: 'активних клієнтів' },
  'Show more': { en: 'Show more', uk: 'Показати ще' },
  'remaining': { en: 'remaining', uk: 'залишилось' },
  'Inactive threshold': { en: 'Inactive threshold', uk: 'Поріг неактивності' },
  'days': { en: 'days', uk: 'днів' },
  'Lost Customers': { en: 'Lost Customers', uk: 'Втрачені клієнти' },
  'Historical Revenue': { en: 'Historical Revenue', uk: 'Історичний дохід' },
  'Critical': { en: 'Critical', uk: 'Критичний' },
  'Recoverable': { en: 'Recoverable', uk: 'Відновлювані' },
  'Last Order': { en: 'Last Order', uk: 'Останнє замовлення' },
  'Days': { en: 'Days', uk: 'Дні' },
  'Revenue': { en: 'Revenue', uk: 'Дохід' },
  'Risk': { en: 'Risk', uk: 'Ризик' },
};

export function t(key: string, lang: Lang): string {
  return translations[key]?.[lang] ?? key;
}
