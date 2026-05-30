import type { Metadata, Viewport } from 'next';
import { IBM_Plex_Sans_Arabic } from 'next/font/google';
import './globals.css';
import { Providers } from './providers';
import { ServiceWorkerRegister } from '@/components/service-worker-register';
import { getLocale } from '@/lib/i18n/server';
import { LOCALE_DIR } from '@/lib/i18n/config';

const arabic = IBM_Plex_Sans_Arabic({
  subsets: ['arabic', 'latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-arabic',
});

export const metadata: Metadata = {
  title: 'AMS | نظام إدارة الأعمال',
  description: 'نظام متكامل لإدارة الأعمال يتأقلم مع نشاطك — عيادات، مطاعم، صالونات، تجارة، وتوزيع.',
  manifest: '/manifest.webmanifest',
  appleWebApp: { capable: true, title: 'AMS', statusBarStyle: 'default' },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#8f1d2e',
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const locale = await getLocale();
  return (
    <html lang={locale} dir={LOCALE_DIR[locale]} suppressHydrationWarning>
      <body className={`${arabic.variable} font-arabic antialiased`}>
        <ServiceWorkerRegister />
        <Providers locale={locale}>{children}</Providers>
      </body>
    </html>
  );
}
