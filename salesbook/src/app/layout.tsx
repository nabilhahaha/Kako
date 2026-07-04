import type { Metadata, Viewport } from 'next';
import './fonts.css';
import './globals.css';

export const metadata: Metadata = {
  title: 'SalesBook — Customer Intelligence for Sales Teams',
  description: 'Know your customer before you visit. A customer-intelligence platform for FMCG sales teams.',
  manifest: '/manifest.webmanifest',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'SalesBook',
  },
  icons: {
    icon: [
      { url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: '/icons/apple-touch-icon.png',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#F8FAFC' },
    { media: '(prefers-color-scheme: dark)', color: '#0B1220' },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html>
      <body>{children}</body>
    </html>
  );
}
