'use client';

import { useEffect, useState, use } from 'react';
import { useTranslations } from 'next-intl';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Bot, BarChart3, MessageSquare, Users, TrendingUp, AlertTriangle } from 'lucide-react';

interface AnalyticsData {
  summary: {
    total_conversations: number;
    total_messages: number;
    avg_confidence: number;
    low_confidence_count: number;
    unique_sessions: number;
  };
  messages_by_day: { date: string; count: number }[];
  usage_summary: Record<string, number>;
  recent_conversations: { id: string; title: string; message_count: number; created_at: string }[];
  crawl_history: { id: string; status: string; job_type: string; total_urls_crawled: number; total_chunks_created: number }[];
  model_usage: Record<string, number>;
}

export default function AnalyticsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const t = useTranslations('agents.detail');
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/agents/${id}/analytics?days=30`)
      .then((r) => r.ok ? r.json() : Promise.reject(new Error('Failed to load')))
      .then((d) => { setData(d); setLoading(false); })
      .catch(() => { setData(null); setLoading(false); });
  }, [id]);

  if (loading) return <div className="p-8 text-center text-muted-foreground">Loading analytics...</div>;
  if (!data) return <div className="p-8 text-muted-foreground">Failed to load analytics.</div>;

  const { summary } = data;
  const confidencePercent = Math.round((summary.avg_confidence || 0) * 100);

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">{t('analytics')}</h1>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <MessageSquare className="h-4 w-4" /> Conversations
            </CardTitle>
          </CardHeader>
          <CardContent><div className="text-2xl font-bold">{summary.total_conversations}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Bot className="h-4 w-4" /> Messages
            </CardTitle>
          </CardHeader>
          <CardContent><div className="text-2xl font-bold">{summary.total_messages}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <TrendingUp className="h-4 w-4" /> Avg Confidence
            </CardTitle>
          </CardHeader>
          <CardContent><div className="text-2xl font-bold">{confidencePercent}%</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Users className="h-4 w-4" /> Unique Sessions
            </CardTitle>
          </CardHeader>
          <CardContent><div className="text-2xl font-bold">{summary.unique_sessions}</div></CardContent>
        </Card>
      </div>

      {summary.low_confidence_count > 0 && (
        <Card className="border-yellow-200 bg-yellow-50">
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 text-yellow-800">
              <AlertTriangle className="h-5 w-5" />
              <span className="font-medium">{summary.low_confidence_count} low-confidence responses in the last 30 days</span>
            </div>
            <p className="mt-1 text-sm text-yellow-700">Consider adding more content or reviewing questions in the eval section.</p>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2 text-lg"><BarChart3 className="h-5 w-5" /> Messages by Day</CardTitle></CardHeader>
          <CardContent>
            {data.messages_by_day.length > 0 ? (
              <div className="space-y-2">
                {data.messages_by_day.slice(-14).map((day) => {
                  const maxCount = Math.max(...data.messages_by_day.map((d) => d.count), 1);
                  return (
                    <div key={day.date} className="flex items-center gap-2">
                      <span className="w-20 text-xs text-muted-foreground">{new Date(day.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span>
                      <div className="flex-1 h-4 bg-muted rounded-full overflow-hidden">
                        <div className="h-full bg-primary rounded-full" style={{ width: `${Math.min(100, (day.count / maxCount) * 100)}%` }} />
                      </div>
                      <span className="w-8 text-xs text-right">{day.count}</span>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-4">No message data yet.</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-lg">Model Usage</CardTitle></CardHeader>
          <CardContent>
            {Object.keys(data.model_usage).length > 0 ? (
              <div className="space-y-3">
                {Object.entries(data.model_usage).map(([model, count]) => (
                  <div key={model} className="flex items-center justify-between">
                    <span className="text-sm font-mono truncate">{model.replace('gemini-', '').replace('-preview', '')}</span>
                    <Badge variant="secondary">{count} calls</Badge>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-4">No model usage data yet.</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-lg">Recent Conversations</CardTitle></CardHeader>
          <CardContent>
            {data.recent_conversations.length > 0 ? (
              <div className="space-y-2">
                {data.recent_conversations.map((conv) => (
                  <div key={conv.id} className="flex items-center justify-between py-1.5 border-b last:border-0">
                    <span className="text-sm truncate flex-1">{conv.title || 'Untitled'}</span>
                    <div className="flex items-center gap-2 shrink-0">
                      <Badge variant="outline" className="text-xs">{conv.message_count} msgs</Badge>
                      <span className="text-xs text-muted-foreground">{new Date(conv.created_at).toLocaleDateString()}</span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-4">No conversations yet.</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-lg">Crawl History</CardTitle></CardHeader>
          <CardContent>
            {data.crawl_history.length > 0 ? (
              <div className="space-y-2">
                {data.crawl_history.map((job) => (
                  <div key={job.id} className="flex items-center justify-between py-1.5 border-b last:border-0">
                    <div className="flex items-center gap-2">
                      <Badge variant={job.status === 'completed' ? 'success' : job.status === 'failed' ? 'destructive' : 'secondary'}>{job.status}</Badge>
                      <span className="text-xs text-muted-foreground">{job.job_type}</span>
                    </div>
                    <span className="text-xs text-muted-foreground">{job.total_urls_crawled} pages</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-4">No crawl history.</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
