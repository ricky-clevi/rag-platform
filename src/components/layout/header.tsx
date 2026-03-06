'use client';

import { useState, useEffect, useMemo } from 'react';
import { useTranslations } from 'next-intl';
import { Link, useRouter, usePathname } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';
import { LanguageSwitcher } from '@/components/common/language-switcher';
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
import { createClient } from '@/lib/supabase/client';
import type { User } from '@supabase/supabase-js';

export function Header() {
  const t = useTranslations('nav');
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState<User | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
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
    router.push('/');
  };

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
          <div className="flex h-11 w-11 items-center justify-center rounded-[1.1rem] bg-primary text-primary-foreground shadow-sm">
            <Bot className="h-5 w-5" />
          </div>
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
              className="rounded-full px-4 py-3 text-sm font-medium text-muted-foreground transition-[background-color,color] duration-200 hover:bg-white/70 hover:text-foreground"
            >
              {item.label}
            </a>
          ))}

          {user && isAppPage && appLinks.map((item) => (
            <Button
              key={item.href}
              variant="ghost"
              size="sm"
              className="rounded-full px-4 text-muted-foreground hover:bg-white/70 hover:text-foreground"
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
                onClick={handleSignOut}
                className="rounded-full px-4 text-muted-foreground hover:bg-white/70 hover:text-foreground"
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
                className="rounded-full px-4 text-muted-foreground hover:bg-white/70 hover:text-foreground"
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
          className="md:hidden rounded-full border border-transparent bg-white/40 hover:bg-white/80"
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
            <LanguageSwitcher />

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
                  onClick={handleSignOut}
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
                    className="rounded-2xl px-4 py-3 text-sm font-medium text-muted-foreground transition-[background-color,color] duration-200 hover:bg-white/80 hover:text-foreground"
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
    </header>
  );
}
