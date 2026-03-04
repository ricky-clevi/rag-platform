'use client';

import { useTranslations } from 'next-intl';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Bot, BarChart3 } from 'lucide-react';

export default function AnalyticsPage() {
  const t = useTranslations('agents.detail');

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">{t('analytics')}</h1>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Bot className="h-5 w-5" />
              Conversations
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex h-32 items-center justify-center text-muted-foreground">
              <p className="text-sm text-center">
                Analytics data will appear here once your agent has conversations.
              </p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <BarChart3 className="h-5 w-5" />
              Usage
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex h-32 items-center justify-center text-muted-foreground">
              <p className="text-sm text-center">
                Usage statistics will be tracked and displayed here.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
