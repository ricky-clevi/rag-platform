'use client';

import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { LogoIcon } from '@/components/common/logo-icon';

export function Footer() {
  const t = useTranslations('footer');

  return (
    <footer className="border-t border-border/70 bg-background/90">
      <div className="container mx-auto flex flex-col gap-6 px-4 py-8 md:flex-row md:items-center md:justify-between">
        <div className="space-y-2">
          <Link href="/" className="flex items-center gap-3 font-semibold text-foreground">
            <LogoIcon className="h-10 w-10 rounded-2xl shadow-sm" />
            <div>
              <div className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
                {t('eyebrow')}
              </div>
              <div className="text-lg">{t('title')}</div>
            </div>
          </Link>
          <p className="max-w-md text-sm text-muted-foreground">{t('subtitle')}</p>
        </div>
        <div className="flex flex-col gap-2 text-sm text-muted-foreground md:items-end">
          <div className="flex flex-wrap items-center gap-4">
            <a href="#capabilities" className="hover:text-foreground">
              {t('capabilities')}
            </a>
            <a href="#examples" className="hover:text-foreground">
              {t('examples')}
            </a>
            <a href="#pricing" className="hover:text-foreground">
              {t('pricing')}
            </a>
          </div>
          <p>{t('copyright', { year: new Date().getFullYear() })}</p>
        </div>
      </div>
    </footer>
  );
}
