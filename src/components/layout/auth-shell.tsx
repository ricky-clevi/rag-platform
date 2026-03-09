'use client';

import type { ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { ChevronRight, Database, Radar, ShieldCheck } from 'lucide-react';
import { LogoIcon } from '@/components/common/logo-icon';

interface AuthShellProps {
  eyebrow: string;
  title: string;
  subtitle: string;
  intentLabel: string;
  nextPath?: string;
  children: ReactNode;
}

export function AuthShell({
  eyebrow,
  title,
  subtitle,
  intentLabel,
  nextPath,
  children,
}: AuthShellProps) {
  const t = useTranslations('auth.shared');
  const nav = useTranslations('nav');

  const proofCards = [
    {
      icon: Database,
      title: t('proofTitle'),
      copy: t('proofCopy'),
    },
    {
      icon: Radar,
      title: t('operatorTitle'),
      copy: t('operatorCopy'),
    },
    {
      icon: ShieldCheck,
      title: t('agentTitle'),
      copy: t('agentCopy'),
    },
  ];

  return (
    <main className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-6 md:py-10">
        <div className="mb-8 flex items-center justify-between gap-4">
          <Link href="/" className="flex items-center gap-3 font-semibold text-foreground">
            <LogoIcon className="h-11 w-11 rounded-[1.1rem] shadow-sm" />
            <div>
              <div className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
                {nav('eyebrow')}
              </div>
              <div className="text-lg">{nav('brand')}</div>
            </div>
          </Link>
          <Link
            href="/"
            className="inline-flex min-h-11 items-center gap-2 rounded-full border border-border/70 bg-surface-glass px-4 text-sm font-medium text-muted-foreground transition-[background-color,color] hover:bg-accent hover:text-foreground"
          >
            {t('backHome')}
          </Link>
        </div>

        <div className="grid gap-6 lg:grid-cols-[1.05fr_0.95fr] lg:items-stretch">
          <section className="surface-card rounded-[2rem] p-8 md:p-10">
            <div className="space-y-6">
              <div className="space-y-4">
                <span className="eyebrow">{eyebrow}</span>
                <h1 className="balanced-heading text-4xl font-semibold tracking-tight md:text-5xl">
                  {title}
                </h1>
                <p className="pretty-copy max-w-2xl text-base text-muted-foreground">
                  {subtitle}
                </p>
              </div>

              <div className="rounded-[1.6rem] border border-border/70 bg-surface-glass-strong p-5 shadow-[0_14px_34px_rgba(31,37,32,0.05)] dark:shadow-[0_14px_34px_rgba(0,0,0,0.2)]">
                <div className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
                  {t('continueTitle')}
                </div>
                <div className="mt-3 flex items-start gap-3">
                  <div className="mt-1 flex h-10 w-10 items-center justify-center rounded-2xl bg-secondary text-secondary-foreground">
                    <ChevronRight className="h-4 w-4" />
                  </div>
                  <div className="space-y-2">
                    <p className="text-base font-semibold text-foreground">{intentLabel}</p>
                    <p className="text-sm leading-6 text-muted-foreground">
                      {nextPath
                        ? t('continueDestination', { path: nextPath })
                        : t('continueFallback')}
                    </p>
                  </div>
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-3">
                {proofCards.map((card) => (
                  <article
                    key={card.title}
                    className="rounded-[1.5rem] border border-border/70 bg-surface-glass p-5 shadow-[0_12px_30px_rgba(31,37,32,0.04)] dark:shadow-[0_12px_30px_rgba(0,0,0,0.2)]"
                  >
                    <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-secondary text-secondary-foreground">
                      <card.icon className="h-5 w-5" />
                    </div>
                    <h2 className="mt-5 text-base font-semibold">{card.title}</h2>
                    <p className="mt-2 text-sm leading-6 text-muted-foreground">{card.copy}</p>
                  </article>
                ))}
              </div>
            </div>
          </section>

          <section className="rounded-[2rem] border border-border/70 bg-surface-glass-strong p-4 shadow-[0_20px_48px_rgba(31,37,32,0.07)] dark:shadow-[0_20px_48px_rgba(0,0,0,0.25)] md:p-6">
            {children}
          </section>
        </div>
      </div>
    </main>
  );
}
