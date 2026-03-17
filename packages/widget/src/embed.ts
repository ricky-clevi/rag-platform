import React from 'react';
import ReactDOM from 'react-dom/client';
import { AgentForgeChat } from './components/Widget';
import { createWidgetContainer, injectStyles } from './utils/shadow-dom';
import widgetCss from './styles/widget.css';
import type { AgentForgeChatProps } from './types';

// Capture the current script reference before any async operations
const currentScript = typeof document !== 'undefined' ? document.currentScript as HTMLScriptElement | null : null;

function init() {
  const script = currentScript;
  if (!script) return;

  const apiKey = script.dataset.apiKey;
  if (!apiKey) {
    console.error('[AgentForge] Missing data-api-key attribute');
    return;
  }

  const props: AgentForgeChatProps = {
    apiKey,
    baseUrl: script.dataset.baseUrl || undefined,
    position: (script.dataset.position as 'bottom-right' | 'bottom-left') || 'bottom-right',
    theme: (script.dataset.theme as 'light' | 'dark' | 'auto') || 'auto',
    primaryColor: script.dataset.primaryColor,
    bubbleIcon: script.dataset.bubbleIcon,
    width: script.dataset.width ? parseInt(script.dataset.width, 10) : undefined,
    height: script.dataset.height ? parseInt(script.dataset.height, 10) : undefined,
    openOnLoad: script.dataset.openOnLoad === 'true',
    persistConversation: script.dataset.persistConversation === 'true',
    showSources: script.dataset.showSources !== 'false',
    showPoweredBy: script.dataset.showPoweredBy !== 'false',
  };

  // Create Shadow DOM container
  const { shadowRoot, mountPoint } = createWidgetContainer();

  // Inject CSS into Shadow DOM
  injectStyles(shadowRoot, widgetCss);

  // Render widget inside Shadow DOM
  const root = ReactDOM.createRoot(mountPoint);
  root.render(React.createElement(AgentForgeChat, props));
}

// Global API for programmatic control
if (typeof window !== 'undefined') {
  (window as unknown as Record<string, unknown>).AgentForge = {
    open: () => document.querySelector('#agentforge-widget')?.dispatchEvent(new CustomEvent('af:open')),
    close: () => document.querySelector('#agentforge-widget')?.dispatchEvent(new CustomEvent('af:close')),
    toggle: () => document.querySelector('#agentforge-widget')?.dispatchEvent(new CustomEvent('af:toggle')),
  };
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
}

export { init };
