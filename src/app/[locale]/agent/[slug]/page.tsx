import { createServiceClient } from '@/lib/supabase/server';
import { ChatInterface } from '@/components/chat/chat-interface';
import { Header } from '@/components/layout/header';
import { Bot, AlertCircle } from 'lucide-react';

interface AgentPageProps {
  params: Promise<{ slug: string }>;
}

export default async function PublicAgentPage({ params }: AgentPageProps) {
  const { slug } = await params;
  const supabase = createServiceClient();

  // Fetch agent — visibility check: public or passcode (not private)
  const { data: agent } = await supabase
    .from('agents')
    .select('*')
    .eq('slug', slug)
    .in('visibility', ['public', 'passcode'])
    .single();

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

  // Get agent settings for welcome message
  const { data: agentSettings } = await supabase
    .from('agent_settings')
    .select('welcome_message')
    .eq('agent_id', agent.id)
    .single();

  const domain = new URL(agent.root_url).hostname.replace('www.', '');

  return (
    <div className="flex h-screen flex-col">
      <Header />
      <div className="flex-1 overflow-hidden">
        <ChatInterface
          agentId={agent.id}
          agentName={agent.name}
          companyName={domain}
          welcomeMessage={agentSettings?.welcome_message || undefined}
        />
      </div>
    </div>
  );
}
