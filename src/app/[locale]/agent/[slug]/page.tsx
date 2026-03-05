import { createServiceClient } from '@/lib/supabase/server';
import { Header } from '@/components/layout/header';
import { Bot, AlertCircle } from 'lucide-react';
import { PublicAgentClient } from './client';
import { recordUsageEvent } from '@/lib/usage-logger';

interface AgentPageProps {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ token?: string; domain?: string }>;
}

export default async function PublicAgentPage({ params, searchParams }: AgentPageProps) {
  const { slug } = await params;
  const { token, domain } = await searchParams;
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

  // Custom domain lookup (#30)
  if (slug === '_domain' && domain) {
    const { data } = await supabase
      .from('agents')
      .select('*')
      .eq('custom_domain', domain)
      .eq('custom_domain_verified', true)
      .single();
    agent = data;
  } else {
    // Normal slug-based lookup
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
      // Check expiration (#15)
      if (shareLink.expires_at && new Date(shareLink.expires_at) < new Date()) {
        return (
          <>
            <Header />
            <main className="flex flex-1 items-center justify-center">
              <div className="text-center">
                <AlertCircle className="mx-auto mb-4 h-12 w-12 text-muted-foreground" />
                <h1 className="mb-2 text-2xl font-bold">Link Expired</h1>
                <p className="text-muted-foreground">This share link has expired.</p>
              </div>
            </main>
          </>
        );
      }

      // Check max uses (#15)
      if (shareLink.max_uses && shareLink.use_count >= shareLink.max_uses) {
        return (
          <>
            <Header />
            <main className="flex flex-1 items-center justify-center">
              <div className="text-center">
                <AlertCircle className="mx-auto mb-4 h-12 w-12 text-muted-foreground" />
                <h1 className="mb-2 text-2xl font-bold">Link Limit Reached</h1>
                <p className="text-muted-foreground">This share link has reached its usage limit.</p>
              </div>
            </main>
          </>
        );
      }

      validShareLink = shareLink;
    }
  }

  // Share link token access (#14)
  if (!agent && token) {
    if (validShareLink) {
      // Load the agent (even if private, share link grants access)
      const { data: sharedAgent } = await supabase
        .from('agents')
        .select('*')
        .eq('id', validShareLink.agent_id)
        .single();
      agent = sharedAgent;
    }
  }

  if (!agent) {
    return (
      <>
        <Header />
        <main className="flex flex-1 items-center justify-center">
          <div className="text-center">
            <AlertCircle className="mx-auto mb-4 h-12 w-12 text-muted-foreground" />
            <h1 className="mb-2 text-2xl font-bold">Agent Not Found</h1>
            <p className="text-muted-foreground">
              This agent does not exist or is not publicly available.
            </p>
          </div>
        </main>
      </>
    );
  }

  if (token && (!validShareLink || validShareLink.agent_id !== agent.id) && agent.visibility !== 'public') {
    return (
      <>
        <Header />
        <main className="flex flex-1 items-center justify-center">
          <div className="text-center">
            <AlertCircle className="mx-auto mb-4 h-12 w-12 text-muted-foreground" />
            <h1 className="mb-2 text-2xl font-bold">Invalid Share Link</h1>
            <p className="text-muted-foreground">
              This share link is invalid, expired, or has reached its usage limit.
            </p>
          </div>
        </main>
      </>
    );
  }

  if (agent.visibility === 'private' && (!token || !validShareLink || validShareLink.agent_id !== agent.id)) {
    return (
      <>
        <Header />
        <main className="flex flex-1 items-center justify-center">
          <div className="text-center">
            <AlertCircle className="mx-auto mb-4 h-12 w-12 text-muted-foreground" />
            <h1 className="mb-2 text-2xl font-bold">Agent Not Public</h1>
            <p className="text-muted-foreground">
              This agent requires a valid share link.
            </p>
          </div>
        </main>
      </>
    );
  }

  // Record share view event (#23)
  if (token && validShareLink && validShareLink.agent_id === agent.id) {
    recordUsageEvent({
      agent_id: agent.id,
      event_type: 'share_view',
      metadata: { token_prefix: token.slice(0, 8) },
    });
  }

  if (agent.status !== 'ready') {
    return (
      <>
        <Header />
        <main className="flex flex-1 items-center justify-center">
          <div className="text-center">
            <Bot className="mx-auto mb-4 h-12 w-12 animate-pulse text-muted-foreground" />
            <h1 className="mb-2 text-2xl font-bold">{agent.name}</h1>
            <p className="text-muted-foreground">
              This agent is still being set up. Please check back later.
            </p>
          </div>
        </main>
      </>
    );
  }

  // Get agent settings
  const { data: agentSettings } = await supabase
    .from('agent_settings')
    .select('welcome_message, starter_questions')
    .eq('agent_id', agent.id)
    .single();

  const agentDomain = new URL(agent.root_url).hostname.replace('www.', '');

  // Skip passcode gate if accessed via valid share token
  const skipPasscode = !!(token && validShareLink && validShareLink.agent_id === agent.id);

  return (
    <PublicAgentClient
      agent={{
        id: agent.id,
        name: agent.name,
        visibility: skipPasscode ? 'public' : agent.visibility,
      }}
      domain={agentDomain}
      welcomeMessage={agentSettings?.welcome_message || undefined}
      starterQuestions={agentSettings?.starter_questions || []}
      shareToken={skipPasscode ? token : undefined}
    />
  );
}
