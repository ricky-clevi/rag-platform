'use client';

import { useState } from 'react';
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
  const [passcode, setPasscode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!passcode.trim()) {
      setError('Please enter a passcode');
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
        setError('Invalid passcode. Please try again.');
        setPasscode('');
      }
    } catch {
      setError('Verification failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
            <Lock className="h-8 w-8 text-primary" />
          </div>
          <CardTitle className="text-xl">{agentName}</CardTitle>
          <p className="text-sm text-muted-foreground">
            This agent is passcode-protected. Enter the passcode to continue.
          </p>
        </CardHeader>
        <form onSubmit={handleSubmit}>
          <CardContent className="space-y-4">
            {error && (
              <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
                {error}
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="passcode">Passcode</Label>
              <Input
                id="passcode"
                type="password"
                value={passcode}
                onChange={(e) => setPasscode(e.target.value)}
                placeholder="Enter passcode"
                disabled={loading}
                autoFocus
              />
            </div>

            <Button type="submit" className="w-full" disabled={loading || !passcode.trim()}>
              {loading ? (
                <Spinner className="mr-2" />
              ) : (
                <ShieldCheck className="mr-2 h-4 w-4" />
              )}
              Verify & Continue
            </Button>
          </CardContent>
        </form>
      </Card>
    </div>
  );
}
