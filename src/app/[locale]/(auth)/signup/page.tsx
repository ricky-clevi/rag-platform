'use client';

import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useSearchParams } from 'next/navigation';
import { Link, useRouter } from '@/i18n/navigation';
import { createClient } from '@/lib/supabase/client';
import { parseAuthIntent } from '@/lib/auth-intent';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Spinner } from '@/components/common/loading-states';
import { AuthShell } from '@/components/layout/auth-shell';

export default function SignupPage() {
  const t = useTranslations('auth.signup');
  const tErrors = useTranslations('auth.errors');
  const tShared = useTranslations('auth.shared');
  const searchParams = useSearchParams();
  const router = useRouter();
  const authIntent = useMemo(() => parseAuthIntent(searchParams), [searchParams]);
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const nextHref = authIntent?.next || '/dashboard';
  const authQuery = authIntent
    ? {
        next: authIntent.next,
        intent: authIntent.intent,
        ...(authIntent.contextLabel
          ? { contextLabel: authIntent.contextLabel }
          : {}),
      }
    : undefined;
  const intentLabel = authIntent?.contextLabel
    ? tShared('intent.custom', { label: authIntent.contextLabel })
    : tShared(`intent.${authIntent?.intent || 'continue'}`);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (password !== confirmPassword) {
      setError(t('passwordMismatch'));
      return;
    }

    if (password.length < 8) {
      setError(tErrors('weakPassword'));
      return;
    }

    setLoading(true);

    const supabase = createClient();
    const { error: authError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: fullName },
      },
    });

    if (authError) {
      if (authError.message.includes('already registered')) {
        setError(tErrors('emailTaken'));
      } else {
        setError(tErrors('generic'));
      }
      setLoading(false);
      return;
    }

    router.push(nextHref);
  };

  return (
    <AuthShell
      eyebrow={tShared('signupEyebrow')}
      title={t('title')}
      subtitle={t('subtitle')}
      intentLabel={intentLabel}
      nextPath={authIntent?.next}
    >
      <Card className="w-full border-0 bg-transparent shadow-none">
        <CardHeader className="text-center">
          <CardTitle>{t('title')}</CardTitle>
          <CardDescription>{t('subtitle')}</CardDescription>
        </CardHeader>
        <form onSubmit={handleSubmit}>
          <CardContent className="space-y-4">
            {error && (
              <div className="rounded-2xl bg-destructive/10 p-3 text-sm text-destructive" aria-live="polite">
                {error}
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="fullName">{t('fullName')}</Label>
              <Input
                id="fullName"
                name="fullName"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder={t('namePlaceholder')}
                autoComplete="name"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="email">{t('email')}</Label>
              <Input
                id="email"
                name="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={t('emailPlaceholder')}
                autoComplete="email"
                spellCheck={false}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">{t('password')}</Label>
              <Input
                id="password"
                name="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={t('passwordPlaceholder')}
                autoComplete="new-password"
                required
                minLength={8}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirmPassword">{t('confirmPassword')}</Label>
              <Input
                id="confirmPassword"
                name="confirmPassword"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder={t('confirmPasswordPlaceholder')}
                autoComplete="new-password"
                required
              />
            </div>
          </CardContent>
          <CardFooter className="flex flex-col gap-4">
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? <Spinner /> : t('submit')}
            </Button>
            <p className="text-sm text-muted-foreground">
              {t('hasAccount')}{' '}
              <Link
                href={{
                  pathname: '/login',
                  query: authQuery,
                }}
                className="text-primary underline decoration-transparent underline-offset-4 transition-[color,decoration-color] hover:decoration-current"
              >
                {t('signInLink')}
              </Link>
            </p>
          </CardFooter>
        </form>
      </Card>
    </AuthShell>
  );
}
