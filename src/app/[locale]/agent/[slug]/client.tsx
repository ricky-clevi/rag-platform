'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { ChatInterface } from '@/components/chat/chat-interface';
import { PasscodeGate } from '@/components/chat/passcode-gate';
import { Badge } from '@/components/ui/badge';
import { Bot, ExternalLink, Globe } from 'lucide-react';
import type { AgentVisibility } from '@/types';

interface PublicAgentClientProps {
  agent: {
    id: string;
    name: string;
    visibility: AgentVisibility;
  };
  domain: string;
  rootUrl: string;
  welcomeMessage?: string;
  starterQuestions: string[];
  shareToken?: string;
}

export function PublicAgentClient({
  agent,
  domain,
  rootUrl,
  welcomeMessage,
  starterQuestions,
  shareToken,
}: PublicAgentClientProps) {
  const t = useTranslations('chat');
  const [verified, setVerified] = useState(agent.visibility !== 'passcode');

  if (!verified) {
    return (
      <PasscodeGate
        agentId={agent.id}
        agentName={agent.name}
        onVerified={() => setVerified(true)}
      />
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-6 md:py-8">
        <div className="mb-6 flex flex-col gap-4 rounded-[2rem] border border-border/70 bg-surface-glass-strong p-5 shadow-[0_20px_48px_rgba(31,37,32,0.07)] dark:shadow-[0_20px_48px_rgba(0,0,0,0.25)] sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-[1.2rem] bg-primary text-primary-foreground shadow-sm">
              <Bot className="h-5 w-5" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-lg font-semibold">{agent.name}</h1>
                <Badge variant="outline" className="bg-surface-glass-strong">
                  {t('poweredBy')}
                </Badge>
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
                <span className="inline-flex items-center gap-1">
                  <Globe className="h-3.5 w-3.5" />
                  {domain}
                </span>
                <span>{t('publicIntro')}</span>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap gap-3">
            <Link
              href="/"
              className="inline-flex min-h-11 items-center gap-2 rounded-full border border-border/70 bg-surface-glass px-4 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              {t('backToPlatform')}
            </Link>
            <a
              href={rootUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex min-h-11 items-center gap-2 rounded-full bg-primary px-4 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary-hover"
            >
              {t('visitSource')}
              <ExternalLink className="h-4 w-4" />
            </a>
          </div>
        </div>

        <div className="min-h-[78vh]">
          <ChatInterface
            agentId={agent.id}
            agentName={agent.name}
            companyName={domain}
            welcomeMessage={welcomeMessage}
            starterQuestions={starterQuestions}
            agentUrl={rootUrl}
            shareToken={shareToken}
          />
        </div>
      </div>
    </div>
  );
}
