import { getTranslations } from 'next-intl/server';
import { AlertCircle, Bot } from 'lucide-react';
import { createServiceClient } from '@/lib/supabase/server';
import { PublicAgentClient } from './client';
import { recordUsageEvent } from '@/lib/usage-logger';

interface AgentPageProps {
  params: Promise<{ slug: string; locale: string }>;
  searchParams: Promise<{ token?: string; domain?: string }>;
}

function StateCard({
  title,
  copy,
  actions = [],
}: {
  title: string;
  copy: string;
  actions?: Array<{ href: string; label: string; external?: boolean }>;
}) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4 py-10">
      <div className="w-full max-w-lg rounded-[2rem] border border-border/70 bg-white/82 p-10 text-center shadow-[0_20px_48px_rgba(31,37,32,0.08)]">
        <AlertCircle className="mx-auto mb-5 h-12 w-12 text-muted-foreground" />
        <h1 className="text-2xl font-semibold">{title}</h1>
        <p className="mt-3 text-sm leading-7 text-muted-foreground">{copy}</p>
        {actions.length ? (
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            {actions.map((action) => (
              <a
                key={`${action.href}-${action.label}`}
                href={action.href}
                target={action.external ? '_blank' : undefined}
                rel={action.external ? 'noreferrer' : undefined}
                className={`inline-flex min-h-11 items-center rounded-full px-4 text-sm font-medium ${
                  action.external
                    ? 'border border-border/70 bg-white text-muted-foreground transition-colors hover:text-foreground'
                    : 'bg-primary text-primary-foreground transition-colors hover:bg-[#175645]'
                }`}
              >
                {action.label}
              </a>
            ))}
          </div>
        ) : null}
      </div>
    </main>
  );
}

function PendingCard({
  title,
  copy,
  actions = [],
}: {
  title: string;
  copy: string;
  actions?: Array<{ href: string; label: string; external?: boolean }>;
}) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4 py-10">
      <div className="w-full max-w-lg rounded-[2rem] border border-border/70 bg-white/82 p-10 text-center shadow-[0_20px_48px_rgba(31,37,32,0.08)]">
        <Bot className="mx-auto mb-5 h-12 w-12 animate-pulse text-muted-foreground" />
        <h1 className="text-2xl font-semibold">{title}</h1>
        <p className="mt-3 text-sm leading-7 text-muted-foreground">{copy}</p>
        {actions.length ? (
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            {actions.map((action) => (
              <a
                key={`${action.href}-${action.label}`}
                href={action.href}
                target={action.external ? '_blank' : undefined}
                rel={action.external ? 'noreferrer' : undefined}
                className={`inline-flex min-h-11 items-center rounded-full px-4 text-sm font-medium ${
                  action.external
                    ? 'border border-border/70 bg-white text-muted-foreground transition-colors hover:text-foreground'
                    : 'bg-primary text-primary-foreground transition-colors hover:bg-[#175645]'
                }`}
              >
                {action.label}
              </a>
            ))}
          </div>
        ) : null}
      </div>
    </main>
  );
}

export default async function PublicAgentPage({
  params,
  searchParams,
}: AgentPageProps) {
  const { slug, locale } = await params;
  const { token, domain } = await searchParams;
  const t = await getTranslations('publicAgent');
  const chatT = await getTranslations('chat');
  const supabase = createServiceClient();

  let agent;
  let validShareLink:
    | {
        agent_id: string;
        expires_at: string | null;
        max_uses: number | null;
        use_count: number;
      }
    | null = null;

  if (slug === '_domain' && domain) {
    const { data } = await supabase
      .from('agents')
      .select('*')
      .eq('custom_domain', domain)
      .eq('custom_domain_verified', true)
      .single();
    agent = data;
  } else {
    const { data } = await supabase
      .from('agents')
      .select('*')
      .eq('slug', slug)
      .in('visibility', ['public', 'passcode'])
      .single();
    agent = data;
  }

  if (token) {
    const { data: shareLink } = await supabase
      .from('share_links')
      .select('agent_id, expires_at, max_uses, use_count, revoked_at')
      .eq('token', token)
      .is('revoked_at', null)
      .single();

    if (shareLink) {
      if (shareLink.expires_at && new Date(shareLink.expires_at) < new Date()) {
        return (
          <StateCard
            title={t('expired.title')}
            copy={t('expired.copy')}
            actions={[{ href: `/${locale}`, label: chatT('backToPlatform') }]}
          />
        );
      }

      if (shareLink.max_uses && shareLink.use_count >= shareLink.max_uses) {
        return (
          <StateCard
            title={t('limit.title')}
            copy={t('limit.copy')}
            actions={[{ href: `/${locale}`, label: chatT('backToPlatform') }]}
          />
        );
      }

      validShareLink = shareLink;
    }
  }

  if (!agent && token && validShareLink) {
    const { data: sharedAgent } = await supabase
      .from('agents')
      .select('*')
      .eq('id', validShareLink.agent_id)
      .single();
    agent = sharedAgent;
  }

  if (!agent) {
    return (
      <StateCard
        title={t('notFound.title')}
        copy={t('notFound.copy')}
        actions={[{ href: `/${locale}`, label: chatT('backToPlatform') }]}
      />
    );
  }

  if (
    token
    && (!validShareLink || validShareLink.agent_id !== agent.id)
    && agent.visibility !== 'public'
  ) {
    return (
      <StateCard
        title={t('invalid.title')}
        copy={t('invalid.copy')}
        actions={[{ href: `/${locale}`, label: chatT('backToPlatform') }]}
      />
    );
  }

  if (
    agent.visibility === 'private'
    && (!token || !validShareLink || validShareLink.agent_id !== agent.id)
  ) {
    return (
      <StateCard
        title={t('private.title')}
        copy={t('private.copy')}
        actions={[{ href: `/${locale}`, label: chatT('backToPlatform') }]}
      />
    );
  }

  if (token && validShareLink && validShareLink.agent_id === agent.id) {
    recordUsageEvent({
      agent_id: agent.id,
      event_type: 'share_view',
      metadata: { token_prefix: token.slice(0, 8) },
    });
  }

  if (agent.status !== 'ready') {
    return (
      <PendingCard
        title={agent.name}
        copy={t('pending.copy')}
        actions={[
          { href: `/${locale}`, label: chatT('backToPlatform') },
          { href: agent.root_url, label: chatT('visitSource'), external: true },
        ]}
      />
    );
  }

  const { data: agentSettings } = await supabase
    .from('agent_settings')
    .select('welcome_message, starter_questions')
    .eq('agent_id', agent.id)
    .single();

  let agentDomain = agent.root_url;
  try {
    agentDomain = new URL(agent.root_url).hostname.replace('www.', '');
  } catch {
    agentDomain = agent.root_url;
  }

  const skipPasscode = !!(token && validShareLink && validShareLink.agent_id === agent.id);

  return (
    <PublicAgentClient
      agent={{
        id: agent.id,
        name: agent.name,
        visibility: skipPasscode ? 'public' : agent.visibility,
      }}
      domain={agentDomain}
      rootUrl={agent.root_url}
      welcomeMessage={agentSettings?.welcome_message || undefined}
      starterQuestions={agentSettings?.starter_questions || []}
      shareToken={skipPasscode ? token : undefined}
    />
  );
}
