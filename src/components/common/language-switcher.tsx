'use client';

import { useLocale } from 'next-intl';
import { useRouter, usePathname } from '@/i18n/navigation';
import { locales, type Locale } from '@/i18n/config';
import { Button } from '@/components/ui/button';
import { Globe } from 'lucide-react';

const localeLabels: Record<Locale, string> = {
  en: 'EN',
  ko: 'KO',
};

export function LanguageSwitcher() {
  const locale = useLocale() as Locale;
  const router = useRouter();
  const pathname = usePathname();

  const nextLocale = locales.find((value) => value !== locale) || locales[0];

  const handleSwitch = () => {
    router.replace(pathname, { locale: nextLocale });
  };

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={handleSwitch}
      className="h-11 rounded-full border border-transparent bg-secondary/50 px-4 text-xs uppercase tracking-[0.16em] text-muted-foreground hover:border-input hover:bg-accent hover:text-foreground"
      aria-label={`Switch language to ${nextLocale.toUpperCase()}`}
    >
      <Globe className="h-4 w-4" />
      <span>{localeLabels[nextLocale]}</span>
    </Button>
  );
}
