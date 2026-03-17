# Installing the AgentForge Chat Widget

Add an AI-powered chat widget to any website. Visitors can ask questions and get answers from your agent with source citations, all through a floating chat bubble.

---

## Prerequisites

1. A **public** agent on AgentForge with status **ready** (has been crawled).
2. A **Widget API Key** (`pk_...`) — generate one from your agent's dashboard under "Embed Widget".
3. At least one **allowed origin** configured on the API key (e.g. `https://yoursite.com`).

---

## Method 1: Script Tag (Any Website)

The simplest way. Works with plain HTML, WordPress, Squarespace, Webflow, Shopify, or any site where you can add custom HTML.

### Basic Usage

Add this before the closing `</body>` tag:

```html
<script
  src="https://cdn.jsdelivr.net/npm/@agentforge/chat-widget/dist/embed.global.js"
  data-api-key="pk_your_api_key_here"
  async
></script>
```

That's it. A chat bubble appears in the bottom-right corner. Clicking it opens the chat panel.

### Self-Hosted

If you prefer to host the script yourself (or your AgentForge instance is self-hosted):

```html
<script
  src="https://your-agentforge-instance.com/widget/embed.global.js"
  data-api-key="pk_your_api_key_here"
  data-base-url="https://your-agentforge-instance.com"
  async
></script>
```

### Full Configuration

```html
<script
  src="https://cdn.jsdelivr.net/npm/@agentforge/chat-widget/dist/embed.global.js"
  data-api-key="pk_your_api_key_here"
  data-base-url="https://your-agentforge-instance.com"
  data-position="bottom-right"
  data-theme="auto"
  data-primary-color="#4f46e5"
  data-bubble-icon="https://yoursite.com/chat-icon.png"
  data-width="400"
  data-height="600"
  data-open-on-load="false"
  data-persist-conversation="false"
  data-show-sources="true"
  data-show-powered-by="true"
  async
></script>
```

### Programmatic Control (JavaScript API)

After the script loads, a global `window.AgentForge` object is available:

```javascript
// Open the chat panel
window.AgentForge.open();

// Close the chat panel
window.AgentForge.close();

// Toggle open/close
window.AgentForge.toggle();
```

**Example: open chat from a custom button**

```html
<button onclick="window.AgentForge.open()">Chat with us</button>
```

**Example: open chat after 5 seconds**

```html
<script>
  setTimeout(() => window.AgentForge.open(), 5000);
</script>
```

---

## Method 2: React Component

For React/Next.js/Remix/Gatsby applications. Install the package and use it as a component.

### Install

```bash
npm install @agentforge/chat-widget
```

### Basic Usage

```tsx
import { AgentForgeChat } from '@agentforge/chat-widget';

export default function App() {
  return (
    <div>
      <h1>My Website</h1>
      {/* Widget renders as a fixed-position overlay — place it anywhere */}
      <AgentForgeChat apiKey="pk_your_api_key_here" />
    </div>
  );
}
```

### Full Configuration

```tsx
import { AgentForgeChat } from '@agentforge/chat-widget';

export default function Layout({ children }) {
  return (
    <>
      {children}
      <AgentForgeChat
        apiKey="pk_your_api_key_here"
        baseUrl="https://your-agentforge-instance.com"
        position="bottom-right"
        theme="auto"
        primaryColor="#4f46e5"
        bubbleIcon="https://yoursite.com/chat-icon.png"
        width={400}
        height={600}
        openOnLoad={false}
        persistConversation={false}
        showSources={true}
        showPoweredBy={true}
        onOpen={() => console.log('Chat opened')}
        onClose={() => console.log('Chat closed')}
        onMessage={(msg) => console.log('New message:', msg)}
        onError={(err) => console.error('Widget error:', err)}
      />
    </>
  );
}
```

### Next.js (App Router)

Place the widget in your root layout so it's available on every page. Since the widget uses browser APIs, it must be a client component:

```tsx
// app/components/ChatWidget.tsx
'use client';

import { AgentForgeChat } from '@agentforge/chat-widget';

export function ChatWidget() {
  return (
    <AgentForgeChat
      apiKey="pk_your_api_key_here"
      theme="auto"
    />
  );
}
```

```tsx
// app/layout.tsx
import { ChatWidget } from './components/ChatWidget';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html>
      <body>
        {children}
        <ChatWidget />
      </body>
    </html>
  );
}
```

### Next.js (Pages Router)

```tsx
// pages/_app.tsx
import type { AppProps } from 'next/app';
import { AgentForgeChat } from '@agentforge/chat-widget';

export default function App({ Component, pageProps }: AppProps) {
  return (
    <>
      <Component {...pageProps} />
      <AgentForgeChat apiKey="pk_your_api_key_here" />
    </>
  );
}
```

### Remix

```tsx
// app/root.tsx
import { AgentForgeChat } from '@agentforge/chat-widget';

export default function App() {
  return (
    <html>
      <body>
        <Outlet />
        <AgentForgeChat apiKey="pk_your_api_key_here" />
      </body>
    </html>
  );
}
```

---

## Configuration Reference

### Required

| Attribute / Prop | Type | Description |
|---|---|---|
| `data-api-key` / `apiKey` | `string` | Your widget API key (`pk_...`). Get this from the agent dashboard. |

### Optional

| Attribute / Prop | Type | Default | Description |
|---|---|---|---|
| `data-base-url` / `baseUrl` | `string` | `https://agentforge.ai` | URL of your AgentForge instance. Set this for self-hosted deployments. |
| `data-position` / `position` | `'bottom-right'` \| `'bottom-left'` | `'bottom-right'` | Where the chat bubble appears on screen. |
| `data-theme` / `theme` | `'light'` \| `'dark'` \| `'auto'` | `'auto'` | Color scheme. `'auto'` follows the visitor's system preference. |
| `data-primary-color` / `primaryColor` | `string` (CSS color) | `'#171717'` | Accent color for the chat bubble and user message bubbles. |
| `data-bubble-icon` / `bubbleIcon` | `string` (image URL) | Built-in chat icon | Custom icon for the chat bubble. Must be an image URL (PNG, SVG, etc). |
| `data-width` / `width` | `number` | `400` | Width of the chat panel in pixels. |
| `data-height` / `height` | `number` | `600` | Height of the chat panel in pixels. |
| `data-open-on-load` / `openOnLoad` | `boolean` | `false` | Automatically open the chat panel when the page loads. |
| `data-persist-conversation` / `persistConversation` | `boolean` | `false` | Resume conversations across browser sessions. See [Conversation Persistence](#conversation-persistence). |
| `data-show-sources` / `showSources` | `boolean` | `true` | Show source citations below assistant messages. |
| `data-show-powered-by` / `showPoweredBy` | `boolean` | `true` | Show "Powered by AgentForge" footer. |

### Callback Props (React only)

| Prop | Type | Description |
|---|---|---|
| `onOpen` | `() => void` | Called when the chat panel opens. |
| `onClose` | `() => void` | Called when the chat panel closes. |
| `onMessage` | `(msg: ChatMessage) => void` | Called when a new message is received (user or assistant). |
| `onError` | `(err: Error) => void` | Called when an error occurs (initialization failure, network error, etc). |

> **Note on `data-*` attributes**: For script tag usage, boolean values must be the strings `"true"` or `"false"`. For `data-show-sources` and `data-show-powered-by`, the default is `true` — set them to `"false"` to disable.

---

## Conversation Persistence

By default, each browser tab gets its own independent conversation. The session identity (linking the visitor to your agent) is shared across tabs, but each tab starts fresh.

Session identity is stored in `localStorage` as `af_widget_{agentId}_jti`. The widget also keeps an internal API-key-to-agent mapping so it can recover that canonical JTI key on reload without relying on the legacy storage format.

### `persistConversation: false` (default)

- Each tab has its own conversation
- Closing the tab loses the conversation history
- Opening a new tab starts a new conversation
- Good for: support widgets, quick Q&A

### `persistConversation: true`

- Conversation resumes across tabs and browser sessions
- Closing and reopening the browser picks up where the visitor left off
- The "New Chat" button resets and starts fresh
- Good for: onboarding flows, documentation assistants

---

## Theming and Customization

### Theme Modes

```html
<!-- Follows visitor's OS preference (light/dark) -->
<script ... data-theme="auto"></script>

<!-- Always light -->
<script ... data-theme="light"></script>

<!-- Always dark -->
<script ... data-theme="dark"></script>
```

### Custom Accent Color

Override the primary color to match your brand:

```html
<script ... data-primary-color="#4f46e5"></script>
```

This changes the chat bubble background and user message bubble color. Any valid CSS color works (`#hex`, `rgb()`, `hsl()`, named colors).

### Custom Bubble Icon

Replace the default chat icon with your own:

```html
<script ... data-bubble-icon="https://yoursite.com/assets/support-icon.svg"></script>
```

The image is displayed at 24x24 pixels. SVG and PNG work best.

### CSS Isolation

The widget renders inside a [Shadow DOM](https://developer.mozilla.org/en-US/docs/Web/API/Web_components/Using_shadow_DOM), which means:

- Your website's CSS will **not** affect the widget's appearance
- The widget's CSS will **not** leak into your website
- No class name conflicts, no style overrides to worry about

### CSS Custom Properties

If you need deeper customization, the widget uses CSS custom properties that you can override on the host element:

```css
#agentforge-widget {
  --af-primary: #4f46e5;       /* Accent color */
  --af-bg: #ffffff;             /* Panel background */
  --af-text: #171717;           /* Primary text color */
  --af-border: #e5e5e5;         /* Border color */
  --af-radius: 16px;            /* Panel border radius */
  --af-font: 'Inter', sans-serif; /* Font family */
}
```

---

## Platform-Specific Guides

### WordPress

1. Go to **Appearance > Theme File Editor** (or use a plugin like "Insert Headers and Footers")
2. Add the script tag just before `</body>` in your theme's `footer.php`:

```html
<script
  src="https://cdn.jsdelivr.net/npm/@agentforge/chat-widget/dist/embed.global.js"
  data-api-key="pk_your_api_key_here"
  async
></script>
```

Or use a plugin like **WPCode** to inject the snippet site-wide.

### Shopify

1. Go to **Online Store > Themes > Edit Code**
2. Open `theme.liquid`
3. Add the script tag just before the closing `</body>` tag

### Webflow

1. Go to **Project Settings > Custom Code**
2. Paste the script tag in the **Footer Code** section
3. Publish your site

### Squarespace

1. Go to **Settings > Advanced > Code Injection**
2. Paste the script tag in the **Footer** field
3. Save

### Wix

1. Go to **Settings > Custom Code**
2. Add new custom code, paste the script tag
3. Set placement to **Body - End**
4. Apply to **All Pages**

### Vue.js

```vue
<template>
  <div id="app">
    <router-view />
  </div>
</template>

<script>
export default {
  mounted() {
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/@agentforge/chat-widget/dist/embed.global.js';
    script.dataset.apiKey = 'pk_your_api_key_here';
    script.dataset.theme = 'auto';
    script.async = true;
    document.body.appendChild(script);
  }
};
</script>
```

### Angular

```typescript
// app.component.ts
import { Component, OnInit } from '@angular/core';

@Component({
  selector: 'app-root',
  template: '<router-outlet></router-outlet>',
})
export class AppComponent implements OnInit {
  ngOnInit() {
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/@agentforge/chat-widget/dist/embed.global.js';
    script.dataset['apiKey'] = 'pk_your_api_key_here';
    script.dataset['theme'] = 'auto';
    script.async = true;
    document.body.appendChild(script);
  }
}
```

### Svelte / SvelteKit

```svelte
<!-- +layout.svelte -->
<script>
  import { onMount } from 'svelte';

  onMount(() => {
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/@agentforge/chat-widget/dist/embed.global.js';
    script.dataset.apiKey = 'pk_your_api_key_here';
    script.dataset.theme = 'auto';
    script.async = true;
    document.body.appendChild(script);
  });
</script>

<slot />
```

---

## Allowed Origins

When creating a Widget API Key, you must specify which domains are allowed to use it. This prevents unauthorized sites from using your key.

### Examples

| Origin | Matches |
|---|---|
| `https://example.com` | Exactly `https://example.com` |
| `https://www.example.com` | Exactly `https://www.example.com` |
| `https://*.example.com` | Any subdomain: `https://app.example.com`, `https://docs.example.com`, etc. Does **not** match `https://example.com` itself. |
| `http://localhost:3000` | Local development on port 3000 |

### Development

For local development, add `http://localhost:3000` (or your dev server's port) to the allowed origins list. You can have multiple origins per key.

Allowed formats are:

- Exact origins like `https://example.com` or `http://localhost:3000`
- Wildcard subdomains like `https://*.example.com`

Origins with paths, query strings, hashes, or malformed wildcard placement are rejected.

---

## Security

### How It Works

1. The widget sends your API key (`pk_...`) to create a session token
2. The session token is a short-lived HMAC-signed credential (24h TTL, auto-refreshes)
3. All chat messages use the session token, not the API key
4. Origin validation ensures only your allowed domains can use the key

### What to Know

- **API keys are public** — they're visible in your page source. That's by design. Security comes from origin validation + rate limiting, not key secrecy.
- **Rate limiting** — each key has a configurable rate limit (default: 30 messages/min). There is also per-IP and per-session rate limiting.
- **Origin binding** — session tokens are bound to the origin that created them. A token created on `https://yoursite.com` cannot be replayed from `https://evil.com`.
- **Agent visibility** — only agents with `public` visibility can be embedded. Private and passcode-protected agents cannot use the widget.

### Streaming Event Schema

The widget chat stream uses SSE and emits these events:

- `text` with incremental `content`
- `sources` with `sources`, `conversation_id`, `confidence`, `model_used`, `answered_from_sources_only`, and `message_id`
- `error` with a user-safe error message
- `[DONE]` to terminate the stream

### Revoking Access

To immediately revoke widget access:
1. Go to your agent's dashboard
2. Find the API key under "Embed Widget"
3. Toggle it to **inactive** or delete it

All active sessions for that key will stop working on the next request.

---

## Troubleshooting

### Widget doesn't appear

- Check the browser console for errors
- Verify your API key is correct and active
- Verify your agent's status is "ready" and visibility is "public"
- Verify your current domain is in the key's allowed origins list

### "Origin not allowed" error

Your current domain isn't in the API key's allowed origins. Add it in the dashboard. Make sure to include the full origin with protocol and port:
- `https://yoursite.com` (not `yoursite.com`)
- `http://localhost:3000` (not `localhost:3000`)

### Chat not responding

- Check if the agent is still in "ready" status
- Check if you've hit the rate limit (429 error in console)
- Verify your AgentForge instance is running (`data-base-url` points to the correct URL)

### Widget conflicts with my site's CSS

The widget uses Shadow DOM for style isolation, so this shouldn't happen. If you see visual issues, check if your site has aggressive global styles that target shadow DOM (rare). The widget sets `all: initial` on its root to prevent style inheritance.

### Multiple widgets on the same page

Only one widget instance per page is supported. If you need multiple agents, use different pages or switch the API key dynamically.

---

## TypeScript Types

The React package exports full TypeScript types:

```typescript
import type {
  AgentForgeChatProps,
  ChatMessage,
  SourceCitation,
  AgentConfig,
  StreamEvent,
} from '@agentforge/chat-widget';
```

### ChatMessage

```typescript
interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  sources?: SourceCitation[];
  isStreaming?: boolean;
  confidence?: number | null;
  modelUsed?: string;
  answeredFromSourcesOnly?: boolean;
  serverMessageId?: string;
}
```

### SourceCitation

```typescript
interface SourceCitation {
  chunk_id?: string;
  url: string;
  title: string;
  snippet: string;
  heading_path?: string;
  similarity?: number;
}
```

---

## Bundle Size

The standalone embed script (used via `<script>` tag) is approximately **20 KB gzipped**. It bundles Preact instead of React for minimal footprint. No external dependencies are loaded at runtime.

The React component package requires `react >= 18` and `react-dom >= 18` as peer dependencies.
