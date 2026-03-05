import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { recordAuditLog } from '@/lib/usage-logger';

/**
 * GET /api/agents/[id]/eval (#20)
 * Get eval dataset and latest results.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data: agent } = await supabase
    .from('agents')
    .select('id')
    .eq('id', id)
    .eq('user_id', user.id)
    .single();

  if (!agent) {
    return NextResponse.json({ error: 'Agent not found' }, { status: 404 });
  }

  // Get eval dataset from settings
  const serviceClient = createServiceClient();
  const { data: settings } = await serviceClient
    .from('agent_settings')
    .select('eval_dataset')
    .eq('agent_id', id)
    .single();

  // Get latest eval results from audit logs
  const { data: latestResults } = await serviceClient
    .from('audit_logs')
    .select('details, created_at')
    .eq('agent_id', id)
    .eq('action', 'nightly_eval_completed')
    .order('created_at', { ascending: false })
    .limit(5);

  return NextResponse.json({
    eval_dataset: (settings as { eval_dataset?: unknown })?.eval_dataset || [],
    recent_results: latestResults || [],
  });
}

/**
 * PUT /api/agents/[id]/eval (#20)
 * Update eval dataset.
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data: agent } = await supabase
    .from('agents')
    .select('id')
    .eq('id', id)
    .eq('user_id', user.id)
    .single();

  if (!agent) {
    return NextResponse.json({ error: 'Agent not found' }, { status: 404 });
  }

  const body = await request.json();
  const { eval_dataset } = body;

  if (!Array.isArray(eval_dataset)) {
    return NextResponse.json({ error: 'eval_dataset must be an array' }, { status: 400 });
  }

  // Validate each eval case
  for (const evalCase of eval_dataset) {
    if (!evalCase.question || typeof evalCase.question !== 'string') {
      return NextResponse.json({ error: 'Each eval case must have a question string' }, { status: 400 });
    }
  }

  const serviceClient = createServiceClient();
  const { error } = await serviceClient
    .from('agent_settings')
    .update({ eval_dataset })
    .eq('agent_id', id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  recordAuditLog({
    user_id: user.id,
    agent_id: id,
    action: 'eval_dataset_updated',
    details: { count: eval_dataset.length },
  });

  return NextResponse.json({ eval_dataset });
}

/**
 * POST /api/agents/[id]/eval (#20)
 * Run eval dataset now (on-demand).
 */
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const serviceClient = createServiceClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data: agent } = await supabase
    .from('agents')
    .select('id, status')
    .eq('id', id)
    .eq('user_id', user.id)
    .single();

  if (!agent) {
    return NextResponse.json({ error: 'Agent not found' }, { status: 404 });
  }

  if (agent.status !== 'ready') {
    return NextResponse.json({ error: 'Agent must be ready to run evals' }, { status: 400 });
  }

  const { data: settings } = await serviceClient
    .from('agent_settings')
    .select('eval_dataset')
    .eq('agent_id', id)
    .single();

  const evalDataset = (settings as { eval_dataset?: { question: string; expected_answer_contains?: string[]; expected_min_confidence?: number }[] })?.eval_dataset || [];

  if (evalDataset.length === 0) {
    return NextResponse.json({ error: 'No eval cases defined' }, { status: 400 });
  }

  // Run evals inline (simplified — for production, queue this)
  const results = [];

  for (const evalCase of evalDataset) {
    try {
      const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
      const response = await fetch(`${appUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agent_id: id,
          message: evalCase.question,
          session_id: `eval-${Date.now()}-${Math.random()}`,
        }),
      });

      const text = await response.text();
      const lines = text.split('\n');
      let answer = '';
      let confidence = 0;

      for (const line of lines) {
        if (line.startsWith('data: ') && line !== 'data: [DONE]') {
          try {
            const parsed = JSON.parse(line.slice(6));
            if (parsed.type === 'text') answer += parsed.content;
            if (parsed.type === 'sources') confidence = parsed.confidence || 0;
          } catch { /* skip */ }
        }
      }

      const failures: string[] = [];
      if (evalCase.expected_answer_contains) {
        for (const kw of evalCase.expected_answer_contains) {
          if (!answer.toLowerCase().includes(kw.toLowerCase())) {
            failures.push(`Missing keyword: "${kw}"`);
          }
        }
      }
      if (evalCase.expected_min_confidence && confidence < evalCase.expected_min_confidence) {
        failures.push(`Low confidence: ${confidence}`);
      }

      results.push({
        question: evalCase.question,
        answer: answer.slice(0, 300),
        confidence,
        passed: failures.length === 0,
        failures,
      });
    } catch (error) {
      results.push({
        question: evalCase.question,
        answer: '',
        confidence: 0,
        passed: false,
        failures: [error instanceof Error ? error.message : 'Error'],
      });
    }
  }

  // Store results
  await serviceClient.from('audit_logs').insert({
    user_id: user.id,
    agent_id: id,
    action: 'nightly_eval_completed',
    details: {
      total: results.length,
      passed: results.filter((r) => r.passed).length,
      failed: results.filter((r) => !r.passed).length,
      results,
      run_at: new Date().toISOString(),
      triggered_by: 'manual',
    },
  });

  return NextResponse.json({
    total: results.length,
    passed: results.filter((r) => r.passed).length,
    failed: results.filter((r) => !r.passed).length,
    results,
  });
}
