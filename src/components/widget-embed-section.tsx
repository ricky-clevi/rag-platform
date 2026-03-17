'use client';

import { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { canonicalizeOrigin } from '@/lib/security/origin';

interface WidgetApiKey {
  id: string;
  agent_id: string;
  public_key: string;
  label: string;
  allowed_origins: string[];
  rate_limit_per_minute: number;
  is_active: boolean;
  created_at: string;
}

interface WidgetEmbedSectionProps {
  agentId: string;
  agentVisibility: 'public' | 'private' | 'passcode';
  platformUrl: string;  // e.g., https://agentforge.ai
}

type OriginValidationResult = {
  normalizedOrigins: string[];
  invalidOrigins: string[];
};

function validateOriginsInput(input: string): OriginValidationResult {
  const invalidOrigins: string[] = [];
  const normalizedOrigins = input
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean)
    .map((origin) => {
      const canonical = canonicalizeOrigin(origin);
      if (!canonical) {
        invalidOrigins.push(origin);
      }
      return canonical;
    })
    .filter((origin): origin is string => Boolean(origin));

  return {
    normalizedOrigins: [...new Set(normalizedOrigins)],
    invalidOrigins,
  };
}

export function WidgetEmbedSection({ agentId, agentVisibility, platformUrl }: WidgetEmbedSectionProps) {
  const t = useTranslations('widget');
  const [keys, setKeys] = useState<WidgetApiKey[]>([]);
  const [isCreating, setIsCreating] = useState(false);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [label, setLabel] = useState('');
  const [origins, setOrigins] = useState('');
  const [copied, setCopied] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'script' | 'react'>('script');
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editOrigins, setEditOrigins] = useState('');
  const [sectionError, setSectionError] = useState<string | null>(null);
  const [createError, setCreateError] = useState<string | null>(null);
  const [editError, setEditError] = useState<string | null>(null);

  // Fetch keys
  useEffect(() => {
    if (agentVisibility !== 'public') return;
    fetch(`/api/agents/${agentId}/widget-keys`)
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(
            typeof data.error === 'string' ? data.error : 'Failed to load widget API keys'
          );
        }
        if (data?.widget_api_keys) {
          setKeys(data.widget_api_keys);
          setSectionError(null);
        }
      })
      .catch((error) => {
        setSectionError(
          error instanceof Error ? error.message : 'Failed to load widget API keys'
        );
      });
  }, [agentId, agentVisibility]);

  if (agentVisibility !== 'public') {
    return null;
  }

  const createValidation = validateOriginsInput(origins);
  const editValidation = validateOriginsInput(editOrigins);

  const handleCreate = async () => {
    if (!label.trim()) return;
    if (createValidation.invalidOrigins.length > 0) {
      setCreateError(
        `Invalid origins: ${createValidation.invalidOrigins.join(', ')}`
      );
      return;
    }

    setIsCreating(true);
    setSectionError(null);
    setCreateError(null);
    try {
      const res = await fetch(`/api/agents/${agentId}/widget-keys`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          label: label.trim(),
          allowed_origins: createValidation.normalizedOrigins,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setKeys(prev => [data.widget_api_key, ...prev]);
        setLabel('');
        setOrigins('');
        setShowCreateForm(false);
      } else {
        const data = await res.json().catch(() => ({ error: 'Failed to create API key' }));
        setCreateError(data.error || 'Failed to create API key');
      }
    } catch {
      setCreateError('Failed to create API key');
    } finally {
      setIsCreating(false);
    }
  };

  const handleToggleActive = async (key: WidgetApiKey) => {
    setSectionError(null);
    const res = await fetch(`/api/agents/${agentId}/widget-keys/${key.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_active: !key.is_active }),
    });
    if (res.ok) {
      const data = await res.json();
      setKeys(prev => prev.map(k => k.id === key.id ? data.widget_api_key : k));
    } else {
      const data = await res.json().catch(() => ({ error: 'Failed to update API key' }));
      setSectionError(data.error || 'Failed to update API key');
    }
  };

  const handleDelete = async (keyId: string) => {
    if (!confirm(t('deleteConfirm'))) return;
    setSectionError(null);
    const res = await fetch(`/api/agents/${agentId}/widget-keys/${keyId}`, {
      method: 'DELETE',
    });
    if (res.ok) {
      setKeys(prev => prev.filter(k => k.id !== keyId));
    } else {
      const data = await res.json().catch(() => ({ error: 'Failed to delete API key' }));
      setSectionError(data.error || 'Failed to delete API key');
    }
  };

  const handleUpdateOrigins = async (key: WidgetApiKey) => {
    if (editValidation.invalidOrigins.length > 0) {
      setEditError(`Invalid origins: ${editValidation.invalidOrigins.join(', ')}`);
      return;
    }

    setEditError(null);
    setSectionError(null);
    const res = await fetch(`/api/agents/${agentId}/widget-keys/${key.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        allowed_origins: editValidation.normalizedOrigins,
      }),
    });
    if (res.ok) {
      const data = await res.json();
      setKeys(prev => prev.map(k => k.id === key.id ? data.widget_api_key : k));
      setEditingKey(null);
      setEditOrigins('');
    } else {
      const data = await res.json().catch(() => ({ error: 'Failed to update origins' }));
      setEditError(data.error || 'Failed to update origins');
    }
  };

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopied(id);
    setTimeout(() => setCopied(null), 2000);
  };

  const getScriptSnippet = (publicKey: string) =>
    `<script\n  src="https://cdn.jsdelivr.net/npm/@agentforge/chat-widget/dist/embed.global.js"\n  data-api-key="${publicKey}"\n  data-base-url="${platformUrl}"\n  async\n></script>`;

  const getReactSnippet = (publicKey: string) =>
    `import { AgentForgeChat } from '@agentforge/chat-widget';\n\n<AgentForgeChat\n  apiKey="${publicKey}"\n  baseUrl="${platformUrl}"\n  theme="auto"\n/>`;

  // Mask the key for display: show first 7 + ... + last 4
  const maskKey = (key: string) => `${key.slice(0, 7)}...${key.slice(-4)}`;

  return (
    <div className="rounded-xl border bg-card p-6 space-y-6">
      <div>
        <h3 className="text-lg font-semibold">{t('title')}</h3>
        <p className="text-sm text-muted-foreground mt-1">{t('description')}</p>
        {sectionError ? (
          <p className="text-xs text-red-600 mt-2">{sectionError}</p>
        ) : null}
      </div>

      {/* API Keys List */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h4 className="text-sm font-medium">{t('apiKeys')}</h4>
          <button
            onClick={() => {
              setShowCreateForm(!showCreateForm);
              setCreateError(null);
              setSectionError(null);
            }}
            className="text-sm px-3 py-1.5 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors"
          >
            {t('createKey')}
          </button>
        </div>

        {/* Create Form */}
        {showCreateForm && (
          <div className="border rounded-lg p-4 space-y-3 bg-muted/30">
            <div>
              <label className="text-sm font-medium">{t('label')}</label>
              <input
                type="text"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder={t('labelPlaceholder')}
                className="mt-1 w-full rounded-md border px-3 py-2 text-sm bg-background"
              />
            </div>
            <div>
              <label className="text-sm font-medium">{t('allowedOrigins')}</label>
              <input
                type="text"
                value={origins}
                onChange={(e) => {
                  setOrigins(e.target.value);
                  setCreateError(null);
                }}
                placeholder={t('originsPlaceholder')}
                className="mt-1 w-full rounded-md border px-3 py-2 text-sm bg-background"
              />
              <p className="text-xs text-muted-foreground mt-1">{t('originsHelp')}</p>
              {createValidation.invalidOrigins.length > 0 ? (
                <p className="text-xs text-red-600 mt-1">
                  Invalid origins: {createValidation.invalidOrigins.join(', ')}
                </p>
              ) : null}
              {createError ? (
                <p className="text-xs text-red-600 mt-1">{createError}</p>
              ) : null}
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleCreate}
                disabled={
                  isCreating ||
                  !label.trim() ||
                  createValidation.invalidOrigins.length > 0
                }
                className="text-sm px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 disabled:opacity-50"
              >
                {isCreating ? t('creating') : t('createKey')}
              </button>
              <button
                onClick={() => {
                  setShowCreateForm(false);
                  setCreateError(null);
                }}
                className="text-sm px-4 py-2 border rounded-md hover:bg-muted"
              >
                {t('cancel')}
              </button>
            </div>
          </div>
        )}

        {/* Keys List */}
        {keys.length === 0 && !showCreateForm ? (
          <p className="text-sm text-muted-foreground py-4 text-center">{t('noKeys')}</p>
        ) : (
          <div className="space-y-3">
            {keys.map((key) => (
              <div key={key.id} className="border rounded-lg p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="font-medium text-sm">{key.label}</span>
                    <span className={`ml-2 text-xs px-2 py-0.5 rounded-full ${
                      key.is_active
                        ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                        : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                    }`}>
                      {key.is_active ? t('active') : t('inactive')}
                    </span>
                  </div>
                  <div className="flex gap-1">
                    <button
                      onClick={() => handleToggleActive(key)}
                      className="text-xs px-2 py-1 border rounded hover:bg-muted"
                    >
                      {key.is_active ? t('deactivate') : t('activate')}
                    </button>
                    <button
                      onClick={() => handleDelete(key.id)}
                      className="text-xs px-2 py-1 border rounded hover:bg-red-50 text-red-600 dark:hover:bg-red-900/20"
                    >
                      {t('delete')}
                    </button>
                  </div>
                </div>

                {/* Key display */}
                <div className="flex items-center gap-2">
                  <code className="text-xs bg-muted px-2 py-1 rounded font-mono flex-1 truncate">
                    {maskKey(key.public_key)}
                  </code>
                  <button
                    onClick={() => copyToClipboard(key.public_key, `key-${key.id}`)}
                    className="text-xs px-2 py-1 border rounded hover:bg-muted"
                  >
                    {copied === `key-${key.id}` ? t('copied') : t('copyCode')}
                  </button>
                </div>

                {/* Origins */}
                <div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">{t('allowedOrigins')}</span>
                    <button
                      onClick={() => {
                        setEditingKey(editingKey === key.id ? null : key.id);
                        setEditOrigins(key.allowed_origins.join(', '));
                        setEditError(null);
                        setSectionError(null);
                      }}
                      className="text-xs text-primary hover:underline"
                    >
                      {t('editOrigins')}
                    </button>
                  </div>
                  {editingKey === key.id ? (
                    <div className="mt-1 flex gap-2">
                      <input
                        type="text"
                        value={editOrigins}
                        onChange={(e) => {
                          setEditOrigins(e.target.value);
                          setEditError(null);
                        }}
                        className="flex-1 rounded-md border px-2 py-1 text-xs bg-background"
                      />
                      <button
                        onClick={() => handleUpdateOrigins(key)}
                        disabled={editValidation.invalidOrigins.length > 0}
                        className="text-xs px-2 py-1 bg-primary text-primary-foreground rounded"
                      >
                        {t('save')}
                      </button>
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {key.allowed_origins.length > 0
                        ? key.allowed_origins.join(', ')
                        : 'All origins (development only)'}
                    </p>
                  )}
                  {editingKey === key.id && editValidation.invalidOrigins.length > 0 ? (
                    <p className="text-xs text-red-600 mt-1">
                      Invalid origins: {editValidation.invalidOrigins.join(', ')}
                    </p>
                  ) : null}
                  {editingKey === key.id && editError ? (
                    <p className="text-xs text-red-600 mt-1">{editError}</p>
                  ) : null}
                </div>

                {/* Code snippets */}
                <div>
                  <div className="flex gap-2 mb-2">
                    <button
                      onClick={() => setActiveTab('script')}
                      className={`text-xs px-3 py-1 rounded-md transition-colors ${
                        activeTab === 'script'
                          ? 'bg-primary text-primary-foreground'
                          : 'bg-muted hover:bg-muted/80'
                      }`}
                    >
                      {t('scriptTag')}
                    </button>
                    <button
                      onClick={() => setActiveTab('react')}
                      className={`text-xs px-3 py-1 rounded-md transition-colors ${
                        activeTab === 'react'
                          ? 'bg-primary text-primary-foreground'
                          : 'bg-muted hover:bg-muted/80'
                      }`}
                    >
                      {t('reactComponent')}
                    </button>
                  </div>
                  <div className="relative">
                    <pre className="text-xs bg-muted p-3 rounded-md overflow-x-auto font-mono whitespace-pre-wrap">
                      {activeTab === 'script'
                        ? getScriptSnippet(key.public_key)
                        : getReactSnippet(key.public_key)}
                    </pre>
                    <button
                      onClick={() =>
                        copyToClipboard(
                          activeTab === 'script'
                            ? getScriptSnippet(key.public_key)
                            : getReactSnippet(key.public_key),
                          `snippet-${key.id}-${activeTab}`
                        )
                      }
                      className="absolute top-2 right-2 text-xs px-2 py-1 bg-background border rounded hover:bg-muted"
                    >
                      {copied === `snippet-${key.id}-${activeTab}` ? t('copied') : t('copyCode')}
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
