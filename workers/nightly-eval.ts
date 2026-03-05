/**
 * Nightly regression/evaluation worker (#21).
 * Runs eval datasets against agents to detect quality regressions.
 *
 * Run with: npx tsx workers/nightly-eval.ts
 */

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { GoogleGenAI } from '@google/genai';

function getSupabaseClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Missing Supabase environment variables');
  return createClient(url, key);
}

function getGeminiClient() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('Missing GEMINI_API_KEY');
  return new GoogleGenAI({ apiKey });
}

interface EvalCase {
  question: string;
  expected_answer_contains?: string[];
  expected_min_confidence?: number;
  expected_sources_only?: boolean;
}

interface EvalResult {
  question: string;
  answer: string;
  confidence: number;
  passed: boolean;
  failures: string[];
}

async function runEvalForAgent(
  agentId: string,
  evalCases: EvalCase[]
): Promise<EvalResult[]> {
  const results: EvalResult[] = [];

  for (const evalCase of evalCases) {
    try {
      // Call the chat API internally
      const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
      const response = await fetch(`${appUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agent_id: agentId,
          message: evalCase.question,
          session_id: `eval-${Date.now()}`,
        }),
      });

      if (!response.ok) {
        results.push({
          question: evalCase.question,
          answer: '',
          confidence: 0,
          passed: false,
          failures: [`HTTP ${response.status}`],
        });
        continue;
      }

      // Parse SSE response
      const text = await response.text();
      const lines = text.split('\n');
      let answer = '';
      let confidence = 0;
      let answeredFromSources = true;

      for (const line of lines) {
        if (line.startsWith('data: ') && line !== 'data: [DONE]') {
          try {
            const parsed = JSON.parse(line.slice(6));
            if (parsed.type === 'text') answer += parsed.content;
            if (parsed.type === 'sources') {
              confidence = parsed.confidence || 0;
              answeredFromSources = parsed.answered_from_sources_only !== false;
            }
          } catch {
            // skip
          }
        }
      }

      // Check assertions
      const failures: string[] = [];

      if (evalCase.expected_answer_contains) {
        for (const keyword of evalCase.expected_answer_contains) {
          if (!answer.toLowerCase().includes(keyword.toLowerCase())) {
            failures.push(`Answer missing expected keyword: "${keyword}"`);
          }
        }
      }

      if (evalCase.expected_min_confidence !== undefined && confidence < evalCase.expected_min_confidence) {
        failures.push(`Confidence ${confidence} below minimum ${evalCase.expected_min_confidence}`);
      }

      if (evalCase.expected_sources_only && !answeredFromSources) {
        failures.push('Answer used general knowledge instead of sources only');
      }

      results.push({
        question: evalCase.question,
        answer: answer.slice(0, 500),
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
        failures: [error instanceof Error ? error.message : 'Unknown error'],
      });
    }
  }

  return results;
}

async function runNightlyEvals() {
  console.log('Starting nightly evaluation run');
  const supabase = getSupabaseClient();

  // Get all agents with eval datasets
  const { data: agents } = await supabase
    .from('agents')
    .select('id, name, status')
    .eq('status', 'ready');

  if (!agents || agents.length === 0) {
    console.log('No ready agents found');
    return;
  }

  for (const agent of agents) {
    // Check if agent has eval cases in settings
    const { data: settings } = await supabase
      .from('agent_settings')
      .select('eval_dataset')
      .eq('agent_id', agent.id)
      .single();

    const evalDataset: EvalCase[] = (settings as { eval_dataset?: EvalCase[] })?.eval_dataset || [];

    if (evalDataset.length === 0) {
      continue;
    }

    console.log(`Running ${evalDataset.length} eval cases for agent "${agent.name}"`);

    const results = await runEvalForAgent(agent.id, evalDataset);

    const passed = results.filter((r) => r.passed).length;
    const failed = results.filter((r) => !r.passed).length;

    console.log(`  Results: ${passed} passed, ${failed} failed`);

    // Store results
    await supabase.from('audit_logs').insert({
      agent_id: agent.id,
      action: 'nightly_eval_completed',
      details: {
        total: results.length,
        passed,
        failed,
        results: results.map((r) => ({
          question: r.question,
          passed: r.passed,
          confidence: r.confidence,
          failures: r.failures,
        })),
        run_at: new Date().toISOString(),
      },
    });

    // If failure rate is high, log a warning
    if (failed > 0 && failed / results.length > 0.3) {
      console.warn(`  WARNING: Agent "${agent.name}" has >30% eval failure rate`);
      await supabase.from('usage_events').insert({
        agent_id: agent.id,
        event_type: 'chat',
        metadata: {
          type: 'eval_regression_warning',
          failure_rate: failed / results.length,
          failed_questions: results.filter((r) => !r.passed).map((r) => r.question),
        },
      });
    }
  }

  console.log('Nightly evaluation run complete');
}

runNightlyEvals().catch(console.error);
