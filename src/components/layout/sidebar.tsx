'use client';

import { useTranslations } from 'next-intl';
import { Link, usePathname } from '@/i18n/navigation';
import { cn } from '@/lib/utils/cn';
import { LayoutDashboard, Bot, Database, Activity, Sparkles, PlusCircle } from 'lucide-react';

const navItems = [
  { href: '/dashboard', icon: LayoutDashboard, labelKey: 'home' as const },
  { href: '/agents', icon: Bot, labelKey: 'agents' as const },
  { href: '/data', icon: Database, labelKey: 'data' as const },
  { href: '/monitor', icon: Activity, labelKey: 'monitor' as const },
  { href: '/insights', icon: Sparkles, labelKey: 'insights' as const },
];

export function Sidebar() {
  const t = useTranslations('nav');
  const pathname = usePathname();

  return (
    <>
      <aside className="hidden md:flex w-72 flex-col gap-5 border-r border-border/80 bg-sidebar-bg px-4 py-5">
        <div className="rounded-[1.5rem] border border-border/70 bg-surface-glass p-4 shadow-[0_12px_30px_rgba(31,37,32,0.05)] dark:shadow-[0_12px_30px_rgba(0,0,0,0.2)]">
          <div className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
            {t('eyebrow')}
          </div>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">{t('sidebarSummary')}</p>
        </div>

        <nav className="flex flex-col gap-1 flex-1">
          {navItems.map((item) => {
            const isActive = pathname === item.href || pathname.startsWith(item.href + '/');

            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'flex min-h-11 items-center gap-3 rounded-2xl px-4 py-3 text-sm font-medium transition-[background-color,color,transform] duration-200',
                  isActive
                    ? 'bg-surface-glass-strong text-foreground shadow-[0_10px_22px_rgba(31,37,32,0.06)] dark:shadow-[0_10px_22px_rgba(0,0,0,0.2)]'
                    : 'text-muted-foreground hover:bg-surface-glass hover:text-foreground'
                )}
              >
                <item.icon className="h-4 w-4 shrink-0" />
                {t(item.labelKey)}
              </Link>
            );
          })}
        </nav>

        <div className="rounded-[1.5rem] border border-border/70 bg-surface-glass p-4 shadow-[0_12px_30px_rgba(31,37,32,0.05)] dark:shadow-[0_12px_30px_rgba(0,0,0,0.2)]">
          <div className="mb-3 text-sm font-semibold text-foreground">{t('launchWorkspace')}</div>
          <p className="mb-4 text-sm leading-6 text-muted-foreground">{t('launchSummary')}</p>
          <Link
            href="/agents/new"
            className="flex min-h-11 items-center justify-center gap-2 rounded-full bg-primary px-4 text-sm font-semibold text-primary-foreground transition-[background-color,transform] duration-200 hover:bg-primary-hover hover:-translate-y-px"
          >
            <PlusCircle className="h-4 w-4" />
            {t('newAgent')}
          </Link>
        </div>
      </aside>

      <nav className="fixed bottom-0 left-0 right-0 z-40 flex md:hidden items-center justify-around border-t border-border/80 bg-background/96 px-2 py-2 backdrop-blur-xl">
        {navItems.map((item) => {
          const isActive = pathname === item.href || pathname.startsWith(item.href + '/');

          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex min-h-11 min-w-14 flex-col items-center justify-center gap-1 rounded-2xl px-3 py-2 text-[11px] font-medium transition-[background-color,color] duration-200',
                isActive ? 'bg-surface-glass-strong text-foreground' : 'text-muted-foreground hover:text-foreground'
              )}
            >
              <item.icon className="h-5 w-5" />
              <span>{t(item.labelKey)}</span>
            </Link>
          );
        })}

        <Link
          href="/agents/new"
          className="flex min-h-11 min-w-14 flex-col items-center justify-center gap-1 rounded-2xl px-3 py-2 text-[11px] font-medium text-muted-foreground transition-[background-color,color] duration-200 hover:bg-accent hover:text-foreground"
        >
          <PlusCircle className="h-5 w-5" />
          <span>{t('newAgent')}</span>
        </Link>
      </nav>
    </>
  );
}
