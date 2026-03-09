'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { Link, useRouter, usePathname } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';
import { LanguageSwitcher } from '@/components/common/language-switcher';
import { ThemeSwitcher } from '@/components/common/theme-switcher';
import {
  Bot,
  LogOut,
  LayoutDashboard,
  Database,
  Activity,
  Sparkles,
  Menu,
  X,
  ArrowRight,
} from 'lucide-react';
import { LogoIcon } from '@/components/common/logo-icon';
import { createClient } from '@/lib/supabase/client';
import type { User } from '@supabase/supabase-js';

export function Header() {
  const t = useTranslations('nav');
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState<User | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [showSignOutConfirm, setShowSignOutConfirm] = useState(false);
  const supabase = useMemo(() => createClient(), []);

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user: currentUser } }) => {
      setUser(currentUser);
    });
  }, [supabase]);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setMobileMenuOpen(false);
    setShowSignOutConfirm(false);
    router.push('/');
  };

  const requestSignOut = useCallback(() => {
    setShowSignOutConfirm(true);
  }, []);

  const cancelSignOut = useCallback(() => {
    setShowSignOutConfirm(false);
  }, []);

  const isAuthPage = pathname === '/login' || pathname === '/signup';
  const isAppPage =
    pathname.startsWith('/dashboard')
    || pathname.startsWith('/agents')
    || pathname.startsWith('/data')
    || pathname.startsWith('/monitor')
    || pathname.startsWith('/insights');

  const marketingLinks = [
    { href: '#product', label: t('product') },
    { href: '#capabilities', label: t('capabilities') },
    { href: '#examples', label: t('examples') },
    { href: '#pricing', label: t('pricing') },
  ];

  const appLinks = [
    { href: '/dashboard', label: t('home'), icon: LayoutDashboard },
    { href: '/data', label: t('data'), icon: Database },
    { href: '/monitor', label: t('monitor'), icon: Activity },
    { href: '/insights', label: t('insights'), icon: Sparkles },
  ];

  return (
    <header className="sticky top-0 z-50 w-full border-b border-border/80 bg-background/85 backdrop-blur-xl supports-[backdrop-filter]:bg-background/70">
      <div className="container mx-auto flex min-h-18 items-center justify-between gap-4 px-4 py-3">
        <Link href="/" className="flex items-center gap-3 font-semibold text-xl">
          <LogoIcon className="h-11 w-11 rounded-[1.1rem] shadow-sm" />
          <div className="min-w-0">
            <div className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
              {t('eyebrow')}
            </div>
            <span className="block truncate text-lg">{t('brand')}</span>
          </div>
        </Link>

        <div className="hidden md:flex items-center gap-2">
          {!user && !isAuthPage && marketingLinks.map((item) => (
            <a
              key={item.href}
              href={item.href}
              className="rounded-full px-4 py-3 text-sm font-medium text-muted-foreground transition-[background-color,color] duration-200 hover:bg-accent hover:text-foreground"
            >
              {item.label}
            </a>
          ))}

          {user && isAppPage && appLinks.map((item) => (
            <Button
              key={item.href}
              variant="ghost"
              size="sm"
              className="rounded-full px-4 text-muted-foreground hover:bg-accent hover:text-foreground"
              asChild
            >
              <Link href={item.href}>
                <item.icon className="h-4 w-4" />
                {item.label}
              </Link>
            </Button>
          ))}
        </div>

        <div className="hidden md:flex items-center gap-3">
          <ThemeSwitcher />
          <LanguageSwitcher />

          {user ? (
            <>
              {!isAppPage && (
                <Button variant="outline" size="sm" asChild>
                  <Link href="/dashboard">
                    <LayoutDashboard className="h-4 w-4" />
                    {t('openWorkspace')}
                  </Link>
                </Button>
              )}
              <Button
                variant="ghost"
                size="sm"
                onClick={requestSignOut}
                className="rounded-full px-4 text-muted-foreground hover:bg-accent hover:text-foreground"
              >
                <LogOut className="h-4 w-4 mr-2" />
                {t('signOut')}
              </Button>
            </>
          ) : !isAuthPage ? (
            <>
              <Button
                variant="ghost"
                size="sm"
                className="rounded-full px-4 text-muted-foreground hover:bg-accent hover:text-foreground"
                asChild
              >
                <Link href="/login">{t('signIn')}</Link>
              </Button>
              <Button size="sm" asChild>
                <Link href="/signup">
                  {t('startBuilding')}
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
            </>
          ) : null}
        </div>

        <Button
          variant="ghost"
          size="icon"
          className="md:hidden rounded-full border border-transparent bg-secondary/50 hover:bg-accent"
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          aria-label={t('toggleMenu')}
          aria-expanded={mobileMenuOpen}
        >
          {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </Button>
      </div>

      {mobileMenuOpen && (
        <div className="md:hidden border-t border-border/70 bg-background/95">
          <nav className="container mx-auto flex flex-col gap-3 px-4 py-4">
            <div className="flex items-center gap-2">
              <ThemeSwitcher />
              <LanguageSwitcher />
            </div>

            {user ? (
              <>
                {appLinks.map((item) => (
                  <Button
                    key={item.href}
                    variant="ghost"
                    size="default"
                    className="justify-start rounded-2xl"
                    asChild
                    onClick={() => setMobileMenuOpen(false)}
                  >
                    <Link href={item.href}>
                      <item.icon className="h-4 w-4 mr-2" />
                      {item.label}
                    </Link>
                  </Button>
                ))}
                <Button
                  variant="ghost"
                  size="default"
                  className="justify-start rounded-2xl"
                  asChild
                  onClick={() => setMobileMenuOpen(false)}
                >
                  <Link href="/agents">
                    <Bot className="h-4 w-4 mr-2" />
                    {t('agents')}
                  </Link>
                </Button>
                <Button
                  variant="outline"
                  size="default"
                  className="justify-start rounded-2xl"
                  asChild
                  onClick={() => setMobileMenuOpen(false)}
                >
                  <Link href="/agents/new">
                    <ArrowRight className="h-4 w-4 mr-2" />
                    {t('newAgent')}
                  </Link>
                </Button>
                <Button
                  variant="ghost"
                  size="default"
                  className="justify-start rounded-2xl"
                  onClick={requestSignOut}
                >
                  <LogOut className="h-4 w-4 mr-2" />
                  {t('signOut')}
                </Button>
              </>
            ) : !isAuthPage ? (
              <>
                {marketingLinks.map((item) => (
                  <a
                    key={item.href}
                    href={item.href}
                    className="rounded-2xl px-4 py-3 text-sm font-medium text-muted-foreground transition-[background-color,color] duration-200 hover:bg-accent hover:text-foreground"
                    onClick={() => setMobileMenuOpen(false)}
                  >
                    {item.label}
                  </a>
                ))}
                <Button
                  variant="ghost"
                  size="default"
                  className="justify-start rounded-2xl"
                  asChild
                  onClick={() => setMobileMenuOpen(false)}
                >
                  <Link href="/login">{t('signIn')}</Link>
                </Button>
                <Button
                  size="default"
                  className="justify-start rounded-2xl"
                  asChild
                  onClick={() => setMobileMenuOpen(false)}
                >
                  <Link href="/signup">
                    {t('startBuilding')}
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </Button>
              </>
            ) : null}
          </nav>
        </div>
      )}

      {showSignOutConfirm && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 backdrop-blur-sm px-4">
          <div className="w-full max-w-sm rounded-[1.6rem] border border-border/70 bg-background p-6 shadow-[0_20px_48px_rgba(31,37,32,0.12)] dark:shadow-[0_20px_48px_rgba(0,0,0,0.4)]">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-destructive/10 text-destructive">
              <LogOut className="h-5 w-5" />
            </div>
            <h3 className="text-center text-lg font-semibold">{t('signOutConfirm')}</h3>
            <p className="mt-2 text-center text-sm leading-6 text-muted-foreground">
              {t('signOutDescription')}
            </p>
            <div className="mt-5 flex gap-3">
              <Button
                variant="outline"
                className="flex-1"
                onClick={cancelSignOut}
              >
                {t('signOutCancel')}
              </Button>
              <Button
                variant="destructive"
                className="flex-1"
                onClick={handleSignOut}
              >
                <LogOut className="h-4 w-4 mr-2" />
                {t('signOut')}
              </Button>
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
