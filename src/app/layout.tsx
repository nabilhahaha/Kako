import type { Metadata, Viewport } from 'next';
import { IBM_Plex_Sans_Arabic } from 'next/font/google';
import './globals.css';
import { Providers } from './providers';
import { ServiceWorkerRegister } from '@/components/service-worker-register';
import { LicenseGate } from '@/components/license-gate';
import { getLocale } from '@/lib/i18n/server';
import { LOCALE_DIR } from '@/lib/i18n/config';

const arabic = IBM_Plex_Sans_Arabic({
  subsets: ['arabic', 'latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-arabic',
});

const TITLE = 'VANTORA Business OS | نظام إدارة الأعمال';
const DESCRIPTION =
  'نظام متكامل لإدارة الأعمال يتأقلم مع نشاطك — عيادات، مطاعم، صالونات، تجارة، وتوزيع.';

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  manifest: '/manifest.webmanifest',
  appleWebApp: { capable: true, title: 'VANTORA', statusBarStyle: 'default' },
  applicationName: 'VANTORA',
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    siteName: 'VANTORA',
    type: 'website',
  },
  twitter: { card: 'summary_large_image', title: TITLE, description: DESCRIPTION },
};

/** Applies the saved theme before paint to avoid a flash of the wrong mode. */
const THEME_SCRIPT = `try{var t=localStorage.getItem('ams-theme');if(t==='dark'||(!t&&window.matchMedia('(prefers-color-scheme: dark)').matches)){document.documentElement.classList.add('dark')}}catch(e){}`;

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#0f2c52',
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
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
        <ServiceWorkerRegister />
        <Providers locale={locale}>
          {/* Offline desktop: enforce activation BEFORE login (vendor-opt-in). */}
          <LicenseGate />
          {children}
        </Providers>
      </body>
    </html>
  );
}
