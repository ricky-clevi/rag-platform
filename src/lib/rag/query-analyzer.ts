import { DEFAULT_CHAT_MODEL, getGeminiClient } from '@/lib/gemini/client';

export type QueryComplexity = 'simple' | 'comparison' | 'multi_part';

export interface QueryAnalysis {
  original: string;
  resolvedQuery: string;
  complexity: QueryComplexity;
  subQueries: string[];
  shouldReflect: boolean;
}

const ANALYZER_TIMEOUT_MS = 6_000;
const MAX_CONTEXT_LENGTH = 1_200;

const COMPARISON_PATTERNS = [
  /\bcompare\b/i,
  /\bcomparison\b/i,
  /\bversus\b/i,
  /\bvs\.?\b/i,
  /\bdifference(?:s)?\b/i,
  /\bbetter than\b/i,
  /\bpros? and cons?\b/i,
];

const MULTI_PART_PATTERNS = [
  /\b(and|also|plus|then)\b/i,
  /[?].+[?]/,
  /\b(first|second|third|finally)\b/i,
];

const LEADING_MULTI_PART_VERBS = ['what', 'which', 'who', 'where', 'when', 'why', 'how', 'is', 'are', 'can', 'does'];
const FOLLOW_UP_PATTERNS = /\b(it|they|them|this|that|those|these|he|she|its|their|there)\b/i;

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function trimContext(conversationContext: string): string {
  return normalizeWhitespace(conversationContext).slice(-MAX_CONTEXT_LENGTH);
}

function splitMultiPartQuery(query: string): string[] {
  const normalized = normalizeWhitespace(query);

  const splitByQuestionMarks = normalized
    .split(/[?]/)
    .map((part) => normalizeWhitespace(part))
    .filter(Boolean);

  if (splitByQuestionMarks.length > 1) {
    return splitByQuestionMarks;
  }

  const candidate = normalized
    .split(/\b(?:and|also|plus|then)\b/gi)
    .map((part) => normalizeWhitespace(part))
    .filter(Boolean);

  if (candidate.length <= 1) {
    return [normalized];
  }

  return candidate.map((part, index) => {
    if (index === 0) {
      return part;
    }

    const lower = part.toLowerCase();
    const hasQuestionLead = LEADING_MULTI_PART_VERBS.some((verb) => lower.startsWith(`${verb} `));
    if (hasQuestionLead) {
      return part;
    }

    const firstWord = normalized.split(/\s+/)[0];
    return `${firstWord} ${part}`;
  });
}

function resolveFollowUpQuery(userMessage: string, conversationContext: string): string {
  const normalizedMessage = normalizeWhitespace(userMessage);
  const normalizedContext = trimContext(conversationContext);

  if (!normalizedContext || !FOLLOW_UP_PATTERNS.test(normalizedMessage)) {
    return normalizedMessage;
  }

  const contextSentences = normalizedContext
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => normalizeWhitespace(sentence))
    .filter(Boolean);

  const anchor = contextSentences.at(-1);
  if (!anchor) {
    return normalizedMessage;
  }

  return `${anchor} ${normalizedMessage}`;
}

function inferComplexity(query: string): QueryComplexity {
  if (COMPARISON_PATTERNS.some((pattern) => pattern.test(query))) {
    return 'comparison';
  }

  const multiPartByPattern = MULTI_PART_PATTERNS.some((pattern) => pattern.test(query));
  const splitParts = splitMultiPartQuery(query);

  if (multiPartByPattern && splitParts.length > 1) {
    return 'multi_part';
  }

  return 'simple';
}

function buildHeuristicAnalysis(userMessage: string, conversationContext: string): QueryAnalysis {
  const resolvedQuery = resolveFollowUpQuery(userMessage, conversationContext);
  const complexity = inferComplexity(resolvedQuery);
  const subQueries =
    complexity === 'simple'
      ? [resolvedQuery]
      : splitMultiPartQuery(resolvedQuery).slice(0, 4);

  return {
    original: normalizeWhitespace(userMessage),
    resolvedQuery,
    complexity,
    subQueries: subQueries.length > 0 ? subQueries : [resolvedQuery],
    shouldReflect: complexity !== 'simple',
  };
}

function parseGeminiAnalysis(
  rawText: string | undefined,
  fallback: QueryAnalysis
): QueryAnalysis {
  if (!rawText) {
    return fallback;
  }

  try {
    const parsed = JSON.parse(rawText) as Partial<QueryAnalysis> & {
      subQueries?: unknown;
      complexity?: unknown;
      shouldReflect?: unknown;
      resolvedQuery?: unknown;
    };

    const resolvedQuery =
      typeof parsed.resolvedQuery === 'string' && parsed.resolvedQuery.trim().length > 0
        ? normalizeWhitespace(parsed.resolvedQuery)
        : fallback.resolvedQuery;

    const complexity: QueryComplexity =
      parsed.complexity === 'comparison' || parsed.complexity === 'multi_part' || parsed.complexity === 'simple'
        ? parsed.complexity
        : fallback.complexity;

    const subQueries = Array.isArray(parsed.subQueries)
      ? parsed.subQueries
          .filter((value): value is string => typeof value === 'string')
          .map((value) => normalizeWhitespace(value))
          .filter(Boolean)
          .slice(0, 4)
      : fallback.subQueries;

    return {
      original: fallback.original,
      resolvedQuery,
      complexity,
      subQueries: subQueries.length > 0 ? subQueries : [resolvedQuery],
      shouldReflect:
        typeof parsed.shouldReflect === 'boolean'
          ? parsed.shouldReflect
          : complexity !== 'simple',
    };
  } catch {
    return fallback;
  }
}

export async function analyzeQuery(
  userMessage: string,
  conversationContext: string = ''
): Promise<QueryAnalysis> {
  const fallback = buildHeuristicAnalysis(userMessage, conversationContext);
  const client = getGeminiClient();

  const prompt = `Classify the user's query for a multi-step retrieval system.

Return valid JSON only with this schema:
{
  "resolvedQuery": "string",
  "complexity": "simple" | "comparison" | "multi_part",
  "subQueries": ["string"],
  "shouldReflect": true | false
}

Rules:
- "simple" means one retrieval pass is enough.
- "comparison" means the user is comparing two or more options, entities, or claims.
- "multi_part" means the user is asking multiple distinct sub-questions that should be retrieved separately.
- Resolve pronouns or follow-up references from the conversation context when possible.
- Keep subQueries concise and retrieval-ready.
- Return 1 subQuery for simple queries, 2-4 for comparison or multi_part queries.
- Set shouldReflect to true for comparison and multi_part queries, or when the query is underspecified.

Conversation context:
${trimContext(conversationContext) || 'None'}

User query:
${normalizeWhitespace(userMessage)}`;

  try {
    const response = await Promise.race([
      client.models.generateContent({
        model: DEFAULT_CHAT_MODEL,
        contents: prompt,
        config: {
          temperature: 0.1,
          maxOutputTokens: 256,
          responseMimeType: 'application/json',
        },
      }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Query analysis timed out')), ANALYZER_TIMEOUT_MS)
      ),
    ]);

    return parseGeminiAnalysis(response.text, fallback);
  } catch {
    return fallback;
  }
}
