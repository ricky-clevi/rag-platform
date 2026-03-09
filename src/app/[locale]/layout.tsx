import type { Metadata, Viewport } from 'next';
import { NextIntlClientProvider } from 'next-intl';
import { getMessages } from 'next-intl/server';
import { Manrope, IBM_Plex_Mono, Noto_Sans_KR } from 'next/font/google';
import { ThemeProvider } from '@/components/common/theme-provider';
import '../globals.css';

const sans = Manrope({
  subsets: ['latin'],
  variable: '--font-ui',
});

const mono = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['400', '500'],
  variable: '--font-mono-ui',
});

const korean = Noto_Sans_KR({
  subsets: ['latin'],
  weight: ['400', '500', '700'],
  variable: '--font-ui-kr',
});

export const metadata: Metadata = {
  title: 'AgentForge | Hybrid Web Intelligence Studio',
  description:
    'Build AI agents, collect web data, and monitor site changes from one calm operating console.',
};

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f4f1ea' },
    { media: '(prefers-color-scheme: dark)', color: '#141916' },
  ],
};

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const messages = await getMessages();

  return (
    <html lang={locale} suppressHydrationWarning className="bg-background text-foreground">
      <body className={`${sans.variable} ${mono.variable} ${korean.variable} min-h-screen antialiased flex flex-col font-sans bg-background text-foreground`}>
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[100] focus:rounded-full focus:bg-primary focus:px-4 focus:py-2 focus:text-sm focus:text-primary-foreground"
        >
          Skip to content
        </a>
        <ThemeProvider>
          <NextIntlClientProvider messages={messages}>
            {children}
          </NextIntlClientProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
