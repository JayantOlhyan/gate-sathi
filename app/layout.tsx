import type { Metadata, Viewport } from 'next';
import { NextIntlClientProvider } from 'next-intl';
import { getLocale, getMessages } from 'next-intl/server';
import './globals.css';

const siteUrl = process.env.AUTH_URL || 'https://gate-sathi.netlify.app';

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  manifest: '/manifest.webmanifest',
  title:
    'GateSathi (गेटसाथी) — Har entry, har bachcha, surakshit | सरकारी विद्यालयों का डिजिटल आगंतुक रजिस्टर',
  description:
    'GateSathi is a free digital visitor register for government schools. सरकारी विद्यालयों के लिए निःशुल्क डिजिटल आगंतुक रजिस्टर — हर एंट्री, हर बच्चा, सुरक्षित।',
  openGraph: {
    title: 'GateSathi (गेटसाथी) — Har entry, har bachcha, surakshit.',
    description:
      'Free digital visitor register for government schools | सरकारी विद्यालयों के लिए निःशुल्क डिजिटल आगंतुक रजिस्टर',
    images: [
      {
        url: '/brand/logo-horizontal.png',
        width: 1200,
        height: 400,
        alt: 'GateSathi Logo',
      },
    ],
  },
  icons: {
    icon: [
      { url: '/icons/favicon.ico', sizes: 'any' },
      { url: '/icons/favicon-32.png', sizes: '32x32', type: 'image/png' },
    ],
    apple: [
      {
        url: '/icons/apple-touch-icon.png',
        sizes: '180x180',
        type: 'image/png',
      },
    ],
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#1E3A8A',
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const locale = await getLocale();
  const messages = await getMessages();

  return (
    <html lang={locale}>
      <body className="min-h-dvh bg-slate-100 text-slate-900 antialiased">
        <NextIntlClientProvider locale={locale} messages={messages}>
          {children}
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
