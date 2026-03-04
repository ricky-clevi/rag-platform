import {
  getGeminiClient,
  DEFAULT_CHAT_MODEL,
  ESCALATION_CHAT_MODEL,
  ESCALATION_CONFIDENCE_THRESHOLD,
} from './client';
import type { MatchedChunk, StructuredAnswer } from '@/types';

function buildSystemPrompt(
  agentName: string,
  rootUrl: string,
  context: MatchedChunk[],
  customSystemPrompt?: string | null
): string {
  const contextText = context
    .map(
      (chunk, i) =>
        `[Source ${i + 1}] (chunk_id: ${chunk.id}, heading: ${chunk.heading_path || 'n/a'}):\n${chunk.content}`
    )
    .join('\n\n---\n\n');

  const basePrompt = customSystemPrompt
    || `You are "${agentName}", an AI assistant with deep knowledge about the company found at ${rootUrl}.`;

  return `${basePrompt}

Your role:
- Answer questions accurately using ONLY the provided context from the company's website
- If the context doesn't contain enough information to answer, say so honestly
- Always be helpful, professional, and concise
- Respond in the same language as the user's question

Context from the company's website:
${contextText}

You MUST respond with valid JSON matching this exact schema:
{
  "answer": "your answer text here (supports markdown)",
  "citations": [
    {
      "chunk_id": "the chunk id from the source",
      "url": "source url if known",
      "title": "page title if known",
      "excerpt": "short relevant excerpt from that source"
    }
  ],
  "confidence": 0.0 to 1.0,
  "answered_from_sources_only": true or false,
  "needs_recrawl": false
}

Rules:
- Only use information from the provided context
- Set confidence based on how well the context supports your answer
- Set answered_from_sources_only to false if you used any general knowledge
- Set needs_recrawl to true if the context seems outdated or incomplete
- Do not make up information`;
}

async function callModel(
  model: string,
  systemPrompt: string,
  contents: { role: 'user' | 'model'; parts: { text: string }[] }[],
  temperature: number,
  maxTokens: number
): Promise<string> {
  const client = getGeminiClient();

  const response = await client.models.generateContent({
    model,
    contents,
    config: {
      systemInstruction: systemPrompt,
      temperature,
      maxOutputTokens: maxTokens,
      responseMimeType: 'application/json',
    },
  });

  return response.text || '';
}

function parseStructuredAnswer(raw: string): StructuredAnswer {
  try {
    const parsed = JSON.parse(raw);
    return {
      answer: parsed.answer || '',
      citations: Array.isArray(parsed.citations) ? parsed.citations : [],
      confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0.5,
      answered_from_sources_only: parsed.answered_from_sources_only ?? true,
      needs_recrawl: parsed.needs_recrawl ?? false,
    };
  } catch {
    return {
      answer: raw,
      citations: [],
      confidence: 0.5,
      answered_from_sources_only: true,
      needs_recrawl: false,
    };
  }
}

export async function generateStructuredResponse(
  agentName: string,
  rootUrl: string,
  userMessage: string,
  context: MatchedChunk[],
  conversationHistory: { role: 'user' | 'assistant'; content: string }[] = [],
  options: {
    systemPrompt?: string | null;
    temperature?: number;
    maxTokens?: number;
    defaultModel?: string;
    escalationModel?: string;
    escalationThreshold?: number;
  } = {}
): Promise<{ structured: StructuredAnswer; model_used: string }> {
  const {
    systemPrompt: customSystemPrompt,
    temperature = 0.7,
    maxTokens = 2048,
    defaultModel = DEFAULT_CHAT_MODEL,
    escalationModel = ESCALATION_CHAT_MODEL,
    escalationThreshold = ESCALATION_CONFIDENCE_THRESHOLD,
  } = options;

  const prompt = buildSystemPrompt(agentName, rootUrl, context, customSystemPrompt);

  const contents = [
    ...conversationHistory.map((msg) => ({
      role: msg.role === 'assistant' ? 'model' as const : 'user' as const,
      parts: [{ text: msg.content }],
    })),
    {
      role: 'user' as const,
      parts: [{ text: userMessage }],
    },
  ];

  // First try with default (fast) model
  const rawResponse = await callModel(defaultModel, prompt, contents, temperature, maxTokens);
  let structured = parseStructuredAnswer(rawResponse);
  let model_used = defaultModel;

  // Escalate to pro model if confidence is below threshold
  if (structured.confidence < escalationThreshold && escalationModel !== defaultModel) {
    const escalatedRaw = await callModel(escalationModel, prompt, contents, temperature, maxTokens);
    const escalated = parseStructuredAnswer(escalatedRaw);
    // Use escalated response if it has higher confidence
    if (escalated.confidence > structured.confidence) {
      structured = escalated;
      model_used = escalationModel;
    }
  }

  return { structured, model_used };
}

export async function* streamChatResponse(
  agentName: string,
  rootUrl: string,
  userMessage: string,
  context: MatchedChunk[],
  conversationHistory: { role: 'user' | 'assistant'; content: string }[] = [],
  options: {
    systemPrompt?: string | null;
    temperature?: number;
    maxTokens?: number;
    model?: string;
  } = {}
): AsyncGenerator<string> {
  const client = getGeminiClient();
  const {
    systemPrompt: customSystemPrompt,
    temperature = 0.7,
    maxTokens = 2048,
    model = DEFAULT_CHAT_MODEL,
  } = options;

  // For streaming, use a simpler prompt without JSON structure requirement
  const contextText = context
    .map(
      (chunk, i) =>
        `[Source ${i + 1}] (${chunk.heading_path || 'n/a'}):\n${chunk.content}`
    )
    .join('\n\n---\n\n');

  const basePrompt = customSystemPrompt
    || `You are "${agentName}", an AI assistant with deep knowledge about the company found at ${rootUrl}.`;

  const systemPrompt = `${basePrompt}

Your role:
- Answer questions accurately using ONLY the provided context
- If the context doesn't contain enough information, say so honestly
- Be helpful, professional, and concise
- Respond in the same language as the user's question
- Reference sources when possible

Context:
${contextText}

Rules:
- Only use information from the provided context
- Do not make up information`;

  const contents = [
    ...conversationHistory.map((msg) => ({
      role: msg.role === 'assistant' ? 'model' as const : 'user' as const,
      parts: [{ text: msg.content }],
    })),
    {
      role: 'user' as const,
      parts: [{ text: userMessage }],
    },
  ];

  const response = await client.models.generateContentStream({
    model,
    contents,
    config: {
      systemInstruction: systemPrompt,
      temperature,
      maxOutputTokens: maxTokens,
    },
  });

  for await (const chunk of response) {
    if (chunk.text) {
      yield chunk.text;
    }
  }
}
