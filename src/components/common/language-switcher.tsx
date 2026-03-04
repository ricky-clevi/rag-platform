'use client';

import { useLocale } from 'next-intl';
import { useRouter, usePathname } from '@/i18n/navigation';
import { locales, type Locale } from '@/i18n/config';
import { Button } from '@/components/ui/button';
import { Globe } from 'lucide-react';

const localeLabels: Record<Locale, string> = {
  en: 'EN',
  ko: '한국어',
};

export function LanguageSwitcher() {
  const locale = useLocale() as Locale;
  const router = useRouter();
  const pathname = usePathname();

  const nextLocale = locales.find((l) => l !== locale) || locales[0];

  const handleSwitch = () => {
    router.replace(pathname, { locale: nextLocale });
  };

  return (
    <Button variant="ghost" size="sm" onClick={handleSwitch} className="gap-1">
      <Globe className="h-4 w-4" />
      <span className="text-xs">{localeLabels[nextLocale]}</span>
    </Button>
  );
}
