'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Spinner } from '@/components/common/loading-states';
import { Lock, ShieldCheck } from 'lucide-react';

interface PasscodeGateProps {
  agentId: string;
  agentName: string;
  onVerified: () => void;
}

export function PasscodeGate({ agentId, agentName, onVerified }: PasscodeGateProps) {
  const t = useTranslations('chat');
  const [passcode, setPasscode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');

    if (!passcode.trim()) {
      setError(t('passcodeRequired'));
      return;
    }

    setLoading(true);

    try {
      const response = await fetch(`/api/agents/${agentId}/verify-passcode`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ passcode: passcode.trim() }),
      });

      const data = await response.json();

      if (data.valid) {
        onVerified();
      } else {
        setError(t('passcodeInvalid'));
        setPasscode('');
      }
    } catch {
      setError(t('passcodeFailed'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-10">
      <Card className="w-full max-w-lg rounded-[2rem] border-border/70 bg-surface-glass-strong shadow-[0_20px_48px_rgba(31,37,32,0.08)] dark:shadow-[0_20px_48px_rgba(0,0,0,0.3)]">
        <CardHeader className="space-y-5 text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-[1.5rem] bg-primary/10 text-primary">
            <Lock className="h-8 w-8" />
          </div>
          <div className="space-y-2">
            <p className="eyebrow text-center">{t('passcodeEyebrow')}</p>
            <CardTitle className="text-2xl">{agentName}</CardTitle>
            <p className="text-sm leading-7 text-muted-foreground">{t('passcodeTitle')}</p>
          </div>
        </CardHeader>
        <form onSubmit={handleSubmit}>
          <CardContent className="space-y-5">
            {error ? (
              <div className="rounded-[1.2rem] bg-destructive/10 p-3 text-sm text-destructive">
                {error}
              </div>
            ) : null}

            <div className="rounded-[1.4rem] border border-border/70 bg-surface-glass p-4 text-left text-sm leading-6 text-muted-foreground">
              <div className="flex items-center gap-2 font-medium text-foreground">
                <ShieldCheck className="h-4 w-4 text-primary" />
                {t('passcodeTrust')}
              </div>
              <p className="mt-2">{t('passcodeCopy')}</p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="passcode">{t('passcodeLabel')}</Label>
              <Input
                id="passcode"
                type="password"
                value={passcode}
                onChange={(event) => setPasscode(event.target.value)}
                placeholder={t('passcodePlaceholder')}
                disabled={loading}
                autoFocus
              />
            </div>

            <Button type="submit" className="w-full" disabled={loading || !passcode.trim()}>
              {loading ? <Spinner className="mr-2" /> : <ShieldCheck className="mr-2 h-4 w-4" />}
              {t('passcodeSubmit')}
            </Button>
          </CardContent>
        </form>
      </Card>
    </div>
  );
}
