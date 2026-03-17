import React from 'react';
import type { AgentConfig } from '../types';

interface WelcomeScreenProps {
  agent: AgentConfig;
  onStarterClick: (question: string) => void;
}

export function WelcomeScreen({ agent, onStarterClick }: WelcomeScreenProps) {
  return (
    <div className="af-welcome">
      <div className="af-welcome-title">{agent.name}</div>
      {agent.welcomeMessage && (
        <div className="af-welcome-subtitle">{agent.welcomeMessage}</div>
      )}
      {agent.starterQuestions.length > 0 && (
        <div className="af-starters">
          {agent.starterQuestions.map((q, i) => (
            <button
              key={i}
              className="af-starter-btn"
              onClick={() => onStarterClick(q)}
            >
              {q}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
