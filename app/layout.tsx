import type { Metadata, Viewport } from 'next';
import { NextIntlClientProvider } from 'next-intl';
import { getLocale, getMessages } from 'next-intl/server';
import './globals.css';

export const metadata: Metadata = {
  title: 'GateSathi | गेटसाथी',
  description: 'Visitor-entry web app for Indian government schools',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
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
          <div className="mx-auto flex min-h-dvh w-full max-w-[360px] flex-col bg-slate-50 shadow-sm">
            {children}
          </div>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
