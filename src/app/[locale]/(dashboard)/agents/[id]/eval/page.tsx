'use client';

import { useState, useEffect, use } from 'react';
import { Plus, Trash2, Play, CheckCircle2, XCircle, Loader2 } from 'lucide-react';

interface EvalCase {
  question: string;
  expected_answer_contains?: string[];
  expected_min_confidence?: number;
}

interface EvalResult {
  question: string;
  answer: string;
  confidence: number;
  passed: boolean;
  failures: string[];
}

interface RecentRun {
  details: {
    total: number;
    passed: number;
    failed: number;
    results: EvalResult[];
    run_at: string;
    triggered_by: string;
  };
  created_at: string;
}

export default function EvalPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [evalCases, setEvalCases] = useState<EvalCase[]>([]);
  const [recentRuns, setRecentRuns] = useState<RecentRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [running, setRunning] = useState(false);
  const [runResults, setRunResults] = useState<{ total: number; passed: number; failed: number; results: EvalResult[] } | null>(null);

  useEffect(() => {
    fetchEvalData();
  }, [id]);

  async function fetchEvalData() {
    try {
      const res = await fetch(`/api/agents/${id}/eval`);
      const data = await res.json();
      setEvalCases(data.eval_dataset || []);
      setRecentRuns(data.recent_results || []);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }

  function addCase() {
    setEvalCases([...evalCases, { question: '', expected_answer_contains: [], expected_min_confidence: 0.5 }]);
  }

  function updateCase(index: number, updates: Partial<EvalCase>) {
    const updated = [...evalCases];
    updated[index] = { ...updated[index], ...updates };
    setEvalCases(updated);
  }

  function removeCase(index: number) {
    setEvalCases(evalCases.filter((_, i) => i !== index));
  }

  async function saveDataset() {
    setSaving(true);
    try {
      await fetch(`/api/agents/${id}/eval`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ eval_dataset: evalCases.filter((c) => c.question.trim()) }),
      });
    } finally {
      setSaving(false);
    }
  }

  async function runEvals() {
    setRunning(true);
    setRunResults(null);
    try {
      // Save first
      await fetch(`/api/agents/${id}/eval`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ eval_dataset: evalCases.filter((c) => c.question.trim()) }),
      });
      // Then run
      const res = await fetch(`/api/agents/${id}/eval`, { method: 'POST' });
      const data = await res.json();
      setRunResults(data);
      fetchEvalData();
    } finally {
      setRunning(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Eval Dataset</h1>
          <p className="text-sm text-muted-foreground">
            Define test cases to evaluate your agent&apos;s answer quality
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={saveDataset}
            disabled={saving}
            className="rounded-lg border px-4 py-2 text-sm font-medium hover:bg-accent disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Save'}
          </button>
          <button
            onClick={runEvals}
            disabled={running || evalCases.filter((c) => c.question.trim()).length === 0}
            className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
            {running ? 'Running...' : 'Run Evals'}
          </button>
        </div>
      </div>

      {/* Test Cases */}
      <div className="space-y-3">
        {evalCases.map((evalCase, index) => (
          <div key={index} className="rounded-lg border bg-card p-4 space-y-3">
            <div className="flex items-start gap-3">
              <span className="mt-2 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium">
                {index + 1}
              </span>
              <div className="flex-1 space-y-2">
                <input
                  type="text"
                  value={evalCase.question}
                  onChange={(e) => updateCase(index, { question: e.target.value })}
                  placeholder="Enter test question..."
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                />
                <div className="flex gap-3">
                  <div className="flex-1">
                    <label className="text-xs text-muted-foreground">Expected keywords (comma-separated)</label>
                    <input
                      type="text"
                      value={(evalCase.expected_answer_contains || []).join(', ')}
                      onChange={(e) =>
                        updateCase(index, {
                          expected_answer_contains: e.target.value
                            .split(',')
                            .map((s) => s.trim())
                            .filter(Boolean),
                        })
                      }
                      placeholder="keyword1, keyword2"
                      className="w-full rounded-md border bg-background px-3 py-1.5 text-sm"
                    />
                  </div>
                  <div className="w-32">
                    <label className="text-xs text-muted-foreground">Min confidence</label>
                    <input
                      type="number"
                      min={0}
                      max={1}
                      step={0.1}
                      value={evalCase.expected_min_confidence || 0.5}
                      onChange={(e) =>
                        updateCase(index, { expected_min_confidence: parseFloat(e.target.value) })
                      }
                      className="w-full rounded-md border bg-background px-3 py-1.5 text-sm"
                    />
                  </div>
                </div>
              </div>
              <button onClick={() => removeCase(index)} className="mt-2 text-muted-foreground hover:text-destructive">
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          </div>
        ))}

        <button
          onClick={addCase}
          className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed py-3 text-sm text-muted-foreground hover:border-primary hover:text-primary"
        >
          <Plus className="h-4 w-4" />
          Add Test Case
        </button>
      </div>

      {/* Run Results */}
      {runResults && (
        <div className="space-y-3">
          <h2 className="text-lg font-semibold">Latest Run Results</h2>
          <div className="flex gap-4 text-sm">
            <span className="font-medium">Total: {runResults.total}</span>
            <span className="text-green-600">Passed: {runResults.passed}</span>
            <span className="text-red-600">Failed: {runResults.failed}</span>
          </div>
          {runResults.results.map((result, i) => (
            <div
              key={i}
              className={`rounded-lg border p-3 ${result.passed ? 'border-green-200 bg-green-50' : 'border-red-200 bg-red-50'}`}
            >
              <div className="flex items-start gap-2">
                {result.passed ? (
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-green-600" />
                ) : (
                  <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />
                )}
                <div className="flex-1">
                  <p className="text-sm font-medium">{result.question}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Confidence: {(result.confidence * 100).toFixed(0)}%
                  </p>
                  {result.answer && (
                    <p className="mt-1 text-xs text-muted-foreground line-clamp-2">{result.answer}</p>
                  )}
                  {result.failures.length > 0 && (
                    <div className="mt-1 space-y-0.5">
                      {result.failures.map((f, fi) => (
                        <p key={fi} className="text-xs text-red-600">{f}</p>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Recent Runs History */}
      {recentRuns.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-lg font-semibold">Recent Eval Runs</h2>
          {recentRuns.map((run, i) => (
            <div key={i} className="rounded-lg border p-3">
              <div className="flex items-center justify-between text-sm">
                <div className="flex gap-3">
                  <span className="font-medium">
                    {run.details.passed}/{run.details.total} passed
                  </span>
                  <span className="text-muted-foreground capitalize">
                    {run.details.triggered_by}
                  </span>
                </div>
                <span className="text-xs text-muted-foreground">
                  {new Date(run.created_at).toLocaleString()}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
