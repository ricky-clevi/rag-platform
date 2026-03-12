'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { ChatInterface } from '@/components/chat/chat-interface';
import { PasscodeGate } from '@/components/chat/passcode-gate';
import { Badge } from '@/components/ui/badge';
import { ExternalLink, Globe } from 'lucide-react';
import { LogoIcon } from '@/components/common/logo-icon';
import { LanguageSwitcher } from '@/components/common/language-switcher';
import { ThemeSwitcher } from '@/components/common/theme-switcher';
import type { AgentVisibility, CompanyProfileData } from '@/types';

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
  companyProfile?: CompanyProfileData;
  shareToken?: string;
}

export function PublicAgentClient({
  agent,
  domain,
  rootUrl,
  welcomeMessage,
  starterQuestions,
  companyProfile,
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
            <LogoIcon className="h-12 w-12 rounded-[1.2rem] shadow-sm" />
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

          <div className="flex flex-wrap items-center gap-3">
            <ThemeSwitcher />
            <LanguageSwitcher />
            <Link
              href="/dashboard"
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
          {companyProfile && (
            <div className="mb-6 grid gap-4 md:grid-cols-3">
              {(companyProfile.products?.length || 0) > 0 && (
                <div className="rounded-[1.5rem] border border-border/70 bg-surface-glass p-4">
                  <p className="text-sm font-semibold">{t('profile.products')}</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {companyProfile.products?.slice(0, 6).map((item) => (
                      <Badge key={item.value} variant="outline" className="bg-surface-glass-strong">
                        {item.value}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
              {(companyProfile.team?.length || 0) > 0 && (
                <div className="rounded-[1.5rem] border border-border/70 bg-surface-glass p-4">
                  <p className="text-sm font-semibold">{t('profile.team')}</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {companyProfile.team?.slice(0, 6).map((item) => (
                      <Badge key={item.value} variant="outline" className="bg-surface-glass-strong">
                        {item.value}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
              {(companyProfile.faqs?.length || 0) > 0 && (
                <div className="rounded-[1.5rem] border border-border/70 bg-surface-glass p-4">
                  <p className="text-sm font-semibold">{t('profile.faqs')}</p>
                  <div className="mt-3 space-y-2">
                    {companyProfile.faqs?.slice(0, 3).map((item) => (
                      <div key={item.question} className="rounded-xl bg-background/70 px-3 py-2">
                        <p className="text-sm font-medium">{item.question}</p>
                        <p className="mt-1 text-xs text-muted-foreground">{item.answer}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
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
