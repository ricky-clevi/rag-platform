import { getGeminiClient, CHAT_MODEL } from './client';
import type { MatchedDocument, SourceCitation } from '@/types';

function buildSystemPrompt(
  agentName: string,
  companyUrl: string,
  context: MatchedDocument[]
): string {
  const contextText = context
    .map(
      (doc, i) =>
        `[Source ${i + 1}] (${doc.metadata.source_url || 'unknown'}):\n${doc.content}`
    )
    .join('\n\n---\n\n');

  return `You are "${agentName}", an AI assistant with deep knowledge about the company found at ${companyUrl}.

Your role:
- Answer questions accurately using ONLY the provided context from the company's website
- If the context doesn't contain enough information to answer, say so honestly
- Always be helpful, professional, and concise
- When possible, reference specific pages or sections from the company's website
- Respond in the same language as the user's question

Context from the company's website:
${contextText}

Important rules:
- Only use information from the provided context
- If you're not sure about something, say you don't have that specific information
- Do not make up or hallucinate information
- Cite your sources when providing information`;
}

export async function generateChatResponse(
  agentName: string,
  companyUrl: string,
  userMessage: string,
  context: MatchedDocument[],
  conversationHistory: { role: 'user' | 'assistant'; content: string }[] = []
): Promise<{ text: string; sources: SourceCitation[] }> {
  const client = getGeminiClient();
  const systemPrompt = buildSystemPrompt(agentName, companyUrl, context);

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

  const response = await client.models.generateContent({
    model: CHAT_MODEL,
    contents,
    config: {
      systemInstruction: systemPrompt,
      temperature: 0.7,
      maxOutputTokens: 2048,
    },
  });

  const text = response.text || 'I apologize, but I was unable to generate a response.';

  // Extract sources from context documents used
  const sources: SourceCitation[] = context
    .filter((doc) => doc.metadata.source_url)
    .map((doc) => ({
      url: doc.metadata.source_url!,
      title: doc.metadata.page_title || doc.metadata.source_url!,
      snippet: doc.content.slice(0, 150) + '...',
    }));

  return { text, sources };
}

export async function* streamChatResponse(
  agentName: string,
  companyUrl: string,
  userMessage: string,
  context: MatchedDocument[],
  conversationHistory: { role: 'user' | 'assistant'; content: string }[] = []
): AsyncGenerator<string> {
  const client = getGeminiClient();
  const systemPrompt = buildSystemPrompt(agentName, companyUrl, context);

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
    model: CHAT_MODEL,
    contents,
    config: {
      systemInstruction: systemPrompt,
      temperature: 0.7,
      maxOutputTokens: 2048,
    },
  });

  for await (const chunk of response) {
    if (chunk.text) {
      yield chunk.text;
    }
  }
}
