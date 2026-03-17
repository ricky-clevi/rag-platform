export const enProductMessages = {
  landing: {
    hero: {
      badge: 'Builder-first web intelligence',
      title: 'Build agents, crawl the web, and monitor change from one studio.',
      subtitle:
        'Launch guided website agents, map domains, search indexed knowledge, extract structured answers, and monitor recrawls from a single calm operating surface.',
      cta: 'Start Building',
      secondaryCta: 'See Capabilities',
      footnote:
        'Signup comes first so your in-progress work, crawl intent, and review context stay attached to your account.',
      metrics: {
        metric1: {
          label: 'Crawl Visibility',
          value: 'Live job metrics',
          copy:
            'See discovered URLs, throughput, changed pages, and failure signals without leaving the workspace.',
        },
        metric2: {
          label: 'Operator Control',
          value: '5 workspaces',
          copy:
            'Move between Home, Agents, Data, Monitor, and Insights without losing the thread.',
        },
        metric3: {
          label: 'Hybrid Output',
          value: 'Agents plus data',
          copy:
            'Build a public assistant, a monitored knowledge base, or both from the same crawl foundation.',
        },
      },
      panel: {
        eyebrow: 'Workspace stack',
        title: 'A practical studio for crawl operations and agent delivery',
        badge: 'Signup-first',
        operatorLabel: 'Operator note',
        operatorCopy:
          'Intent is preserved across auth so teams can begin from a protected workspace and continue exactly where they left off.',
        workspaces: {
          home: {
            title: 'Home',
            description:
              'A builder-first launch surface with recent agents, live workload counts, and direct links into every operator flow.',
          },
          data: {
            title: 'Data',
            description:
              'Map domains, trigger crawl runs, search indexed knowledge, and extract focused answers from crawled content.',
          },
          monitor: {
            title: 'Monitor',
            description:
              'Review recrawl cadence, changed content, job throughput, and crawl health from one screen.',
          },
          insights: {
            title: 'Insights',
            description:
              'Track conversations, confidence, crawl outcomes, and evaluation prompts to decide what to tune next.',
          },
        },
      },
    },
    product: {
      eyebrow: 'How it works',
      title: 'Start with the source. End with an operating system for web knowledge.',
      description:
        'The studio combines guided crawl setup, preflight validation, hybrid operating modes, and post-launch review so builders do not need separate tools for crawling, answering, and monitoring.',
    },
    workflow: {
      stepLabel: 'Step {value}',
      steps: [
        {
          title: 'Source Setup',
          description:
            'Begin from a website URL, tune crawl scope, and define what should or should not be indexed.',
        },
        {
          title: 'Preflight',
          description:
            'Preview sitemap coverage, robots access, site shape, and likely crawl reach before you commit compute.',
        },
        {
          title: 'Mode',
          description:
            'Choose whether the run should behave like an agent workflow, a data workflow, or a hybrid of both.',
        },
        {
          title: 'Launch and Review',
          description:
            'Run the crawl, inspect knowledge, monitor change, and move into analytics or evaluation without leaving the product.',
        },
      ],
    },
    capabilities: {
      eyebrow: 'Capabilities',
      title:
        'Firecrawl-style primitives, wrapped in a more operator-friendly workspace.',
      subtitle:
        'The first release emphasizes product-surface parity and perceived speed: map, crawl, search, extract, publish, and monitor, with a clear infrastructure roadmap for higher throughput.',
      cards: [
        {
          title: 'Map and Crawl',
          description:
            'Discover URLs, inspect sitemap coverage, and trigger crawl jobs with visible progress instead of opaque background work.',
        },
        {
          title: 'Search and Extract',
          description:
            'Search your indexed knowledge base or run focused extraction prompts against recently crawled content.',
        },
        {
          title: 'Monitoring and Diffing',
          description:
            'Track changed pages, recrawl cadence, and failure reasons to keep web intelligence fresh and trustworthy.',
        },
        {
          title: 'Publishing and Evaluation',
          description:
            'Publish a public assistant, control share access, and move into analytics and eval when the crawl is ready.',
        },
      ],
    },
    examples: {
      eyebrow: 'Examples',
      title: 'One crawl foundation, multiple operating modes.',
      subtitle:
        'Use the same platform for customer-facing assistants, internal research workflows, or continuous website monitoring.',
      cards: [
        {
          title: 'Public Website Agent',
          description:
            'Launch a branded assistant grounded in a company site, complete with source citations and controlled sharing.',
          badge: 'Agent',
        },
        {
          title: 'Research Workspace',
          description:
            'Map a domain, search knowledge, and extract structured answers for operators who need signal fast.',
          badge: 'Data',
        },
        {
          title: 'Content Change Watch',
          description:
            'Keep recrawl cadence visible, watch changed pages, and route follow-up work from the monitoring surface.',
          badge: 'Monitor',
        },
      ],
    },
    pricing: {
      eyebrow: 'Pricing',
      title: 'Simple plans for builders, operators, and teams.',
      subtitle:
        'Phase one focuses on crawl visibility and hybrid workflows. Higher-throughput infrastructure parity is a roadmap item, not a vague promise.',
      tiers: [
        {
          name: 'Starter',
          price: '$0',
          description:
            'For trying the builder, smaller websites, and early validation of crawl workflows.',
          points: [
            'Guided agent creation',
            'Data workspace access',
            'Basic monitoring',
          ],
        },
        {
          name: 'Operator',
          price: '$49',
          description:
            'For teams that need repeatable crawl operations, monitoring, and analytics review.',
          featured: true,
          points: [
            'Hybrid workflows',
            'Share links and passcodes',
            'Insights and evaluation surfaces',
          ],
        },
        {
          name: 'Enterprise',
          price: 'Custom',
          description:
            'For teams that need multi-operator governance, custom domains, and a throughput roadmap aligned to production needs.',
          points: [
            'Custom domain support',
            'Higher crawl concurrency roadmap',
            'Operational planning support',
          ],
        },
      ],
    },
    cta: {
      eyebrow: 'Ready to build',
      title:
        'Turn a website into a monitored intelligence layer and a publishable agent.',
      subtitle:
        'Create an account, preserve your intent, and move directly into the builder, data, monitor, or insight surfaces you need next.',
      primary: 'Create Account',
      secondary: 'Sign In',
    },
  },
  data: {
    eyebrow: 'Data workspace',
    title: 'Map, crawl, search, and extract from your indexed web layer.',
    subtitle:
      'Use Firecrawl-style primitives on top of your own crawl foundation, without leaving the authenticated operator surface.',
    map: {
      title: 'Map a site',
      description:
        'Inspect sitemap coverage, robots access, and discovered URLs before you launch or expand a crawl.',
      sitemapFound: 'Sitemap found',
      noSitemap: 'No sitemap',
      crawlAllowed: 'Crawl allowed',
      crawlBlocked: 'Blocked by robots',
      discoveryCount: '{count} URLs discovered',
    },
    crawl: {
      title: 'Launch crawl',
      description:
        'Trigger a crawl run on an existing agent and move directly into monitoring once the job is queued.',
      launchedTitle: 'Crawl queued',
      launchedCopy:
        'The run has been handed to the crawl worker. Continue into monitor to inspect throughput and health.',
      openData: 'Open data context',
      openWorkspace: 'Open monitor',
    },
    search: {
      title: 'Search indexed knowledge',
      match: '{score}% match',
      empty: 'Search results will appear here.',
    },
    extract: {
      title: 'Extract focused answer',
      noSummary: 'No answer was returned.',
      sources: 'Sources',
    },
    fields: {
      url: 'Website URL',
      agent: 'Agent',
      query: 'Search query',
      prompt: 'Extraction prompt',
    },
    actions: {
      loading: 'Working...',
      map: 'Run map',
      launchCrawl: 'Launch crawl',
      search: 'Search',
      extract: 'Extract',
    },
    errors: {
      requestFailed: 'Request failed.',
      mapFailed: 'Map failed.',
      launchFailed: 'Launch failed.',
      searchFailed: 'Search failed.',
      extractFailed: 'Extract failed.',
    },
  },
  monitor: {
    eyebrow: 'Monitoring workspace',
    title: 'Keep crawl operations visible and predictable.',
    subtitle:
      'Review changed pages, discovered scope, throughput, failure signals, and recrawl cadence in one place.',
    agentLabel: 'Target agent',
    metrics: {
      changedPages: 'Changed pages',
      discovered: 'Discovered URLs',
      crawled: 'Crawled URLs',
      throughput: 'Pages per minute',
    },
    policy: {
      title: 'Recrawl policy',
      enabled: 'Enabled',
      disabled: 'Disabled',
      cadence: 'Every {hours} hours',
      empty: 'No recrawl policy configured.',
      nextRun: 'Next run: {date}',
      noNextRun: 'No next run scheduled.',
    },
    jobs: {
      title: 'Recent crawl jobs',
      crawledCount: '{count} URLs crawled',
      empty: 'No recent crawl jobs yet.',
    },
    failures: {
      title: 'Failure signal',
      empty: 'No failed pages detected in the current crawl summary.',
    },
  },
  insights: {
    eyebrow: 'Insights workspace',
    title: 'Review usage, confidence, and crawl outcomes together.',
    subtitle:
      'Pull conversation volume, message load, confidence gaps, and crawl history into one review layer so the team can decide what to tune next.',
    agentLabel: 'Review target',
    openEval: 'Open eval',
    metrics: {
      conversations: 'Conversations',
      messages: 'Messages',
      confidence: 'Average confidence',
      lowConfidence: 'Low confidence replies',
    },
    conversations: {
      title: 'Recent conversations',
      empty: 'No recent conversations yet.',
      untitled: 'Untitled conversation',
      meta: '{count} messages / {date}',
    },
    crawlHistory: {
      title: 'Recent crawl history',
      empty: 'No crawl history yet.',
      meta: '{urls} URLs / {chunks} chunks',
    },
  },
  chat: {
    title: 'Chat with {agentName}',
    placeholder: 'Ask a question about {companyName}...',
    inputPlaceholder: 'Type a message...',
    inputAria: 'Chat message',
    inputHint: 'Enter to send / Shift+Enter for new line',
    send: 'Send',
    thinking: 'Thinking...',
    sources: 'Sources',
    sourcesCount: '{count, plural, one {# source} other {# sources}}',
    newConversation: 'New conversation',
    welcome:
      'Hello. I am an AI assistant grounded in {companyName}. Ask me anything.',
    error: 'Sorry, I encountered an error. Please try again.',
    requestFailed: 'Chat request failed.',
    retryAfter: 'Please try again in {seconds} seconds.',
    noResponseBody: 'No response body returned.',
    poweredBy: 'Powered by AgentForge',
    groundedLabel: 'Grounded responses',
    groundedCopy:
      'Ask questions about {companyName} and review answers with source citations drawn from the indexed site.',
    profile: {
      products: 'Products',
      team: 'Team',
      faqs: 'FAQs',
    },
    starterTitle: 'Suggested starting prompts',
    publicIntro: 'Public web agent',
    backToPlatform: 'Back to platform',
    visitSource: 'Visit source site',
    noSources: 'No specific sources for this response',
    tryAsking: 'Try asking:',
    lowConfidenceWarning:
      'This answer may be incomplete. The indexed content did not strongly support it.',
    generalKnowledgeWarning:
      'This answer includes information beyond the indexed site content.',
    confidenceHigh: 'High confidence',
    confidenceMedium: 'Medium confidence',
    confidenceLow: 'Low confidence',
    copy: 'Copy',
    copied: 'Copied',
    helpful: 'Helpful',
    notHelpful: 'Not helpful',
    passcodeEyebrow: 'Protected access',
    passcodeTitle:
      'This agent is protected. Enter the passcode to continue.',
    passcodeCopy:
      'Access is limited to approved viewers. Enter the passcode provided by the workspace owner to open this public agent.',
    passcodeTrust: 'Secure access gate',
    passcodeLabel: 'Passcode',
    passcodePlaceholder: 'Enter passcode',
    passcodeSubmit: 'Verify and continue',
    passcodeRequired: 'Please enter a passcode',
    passcodeInvalid: 'Invalid passcode. Please try again.',
    passcodeFailed: 'Verification failed. Please try again.',
  },
  widget: {
    title: 'Embed Widget',
    description: 'Add a chat widget to your website so visitors can interact with your agent.',
    requiresPublic: 'Widget embedding is only available for public agents. Change visibility to "Public" to enable.',
    apiKeys: 'API Keys',
    noKeys: 'No API keys yet. Create one to embed the widget on your website.',
    createKey: 'Create API Key',
    label: 'Label',
    labelPlaceholder: 'e.g., Production Website',
    allowedOrigins: 'Allowed Origins',
    originsPlaceholder: 'e.g., https://example.com, https://*.example.com',
    originsHelp: 'Comma-separated list of origins where the widget is allowed. Leave empty to allow all origins in development.',
    publicKey: 'Public Key',
    status: 'Status',
    active: 'Active',
    inactive: 'Inactive',
    actions: 'Actions',
    deactivate: 'Deactivate',
    activate: 'Activate',
    delete: 'Delete',
    deleteConfirm: 'Are you sure? This will immediately disable the widget for all sites using this key.',
    codeSnippet: 'Code Snippet',
    scriptTag: 'Script Tag',
    reactComponent: 'React',
    copyCode: 'Copy',
    copied: 'Copied!',
    creating: 'Creating...',
    created: 'API key created successfully',
    deleted: 'API key deleted',
    updated: 'API key updated',
    rateLimitLabel: 'Rate Limit (per minute)',
    editOrigins: 'Edit Origins',
    save: 'Save',
    cancel: 'Cancel',
  },
  publicAgent: {
    expired: {
      title: 'Share link expired',
      copy:
        'This share link has expired and can no longer open the public agent.',
    },
    limit: {
      title: 'Share link limit reached',
      copy: 'This share link has reached its usage limit.',
    },
    notFound: {
      title: 'Agent not found',
      copy: 'This agent does not exist or is not publicly available.',
    },
    invalid: {
      title: 'Invalid share link',
      copy:
        'This share link is invalid, expired, or no longer allowed for this agent.',
    },
    private: {
      title: 'Private agent',
      copy:
        'This agent requires a valid share link before it can be opened.',
    },
    pending: {
      copy: 'This agent is still being prepared. Check back shortly.',
    },
  },
} as const;
