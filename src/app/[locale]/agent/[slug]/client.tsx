'use client';

import { useState } from 'react';
import { ChatInterface } from '@/components/chat/chat-interface';
import { PasscodeGate } from '@/components/chat/passcode-gate';
import { Header } from '@/components/layout/header';
import type { AgentVisibility } from '@/types';

interface PublicAgentClientProps {
  agent: {
    id: string;
    name: string;
    visibility: AgentVisibility;
  };
  domain: string;
  welcomeMessage?: string;
  starterQuestions: string[];
  shareToken?: string;
}

export function PublicAgentClient({
  agent,
  domain,
  welcomeMessage,
  starterQuestions,
  shareToken,
}: PublicAgentClientProps) {
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
    <div className="flex h-screen flex-col">
      <Header />
      <div className="flex-1 overflow-hidden">
        <ChatInterface
          agentId={agent.id}
          agentName={agent.name}
          companyName={domain}
          welcomeMessage={welcomeMessage}
          starterQuestions={starterQuestions}
          shareToken={shareToken}
        />
      </div>
    </div>
  );
}
