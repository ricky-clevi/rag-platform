import { getGeminiClient, DEFAULT_CHAT_MODEL } from '@/lib/gemini/client';

export interface EnhancedQuery {
  original: string;
  reformulated: string;
  searchTerms: string[];
  isFollowUp: boolean;
}

export async function enhanceQuery(
  userMessage: string,
  conversationContext: string,
  agentName: string
): Promise<EnhancedQuery> {
  const client = getGeminiClient();

  const prompt = `You are a search query optimizer for "${agentName}". Given a user's question and conversation context, produce an optimized search query.

Rules:
- If the question is a follow-up (uses "it", "that", "they", "this", etc.), resolve the references using conversation context
- Expand abbreviations and acronyms if context makes them clear
- Extract key search terms (nouns, proper nouns, technical terms)
- Keep the reformulated query concise but complete

Conversation context (last few messages):
${conversationContext || 'None'}

User question: "${userMessage}"

Respond with valid JSON:
{
  "reformulated": "the improved search query",
  "searchTerms": ["term1", "term2", "term3"],
  "isFollowUp": true/false
}`;

  try {
    const result = await Promise.race([
      client.models.generateContent({
        model: DEFAULT_CHAT_MODEL,
        contents: prompt,
        config: {
          temperature: 0.1,
          maxOutputTokens: 200,
          responseMimeType: 'application/json',
        },
      }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Query enhancement timed out')), 5000)
      ),
    ]);

    const parsed = JSON.parse(result.text || '{}');
    return {
      original: userMessage,
      reformulated: parsed.reformulated || userMessage,
      searchTerms: Array.isArray(parsed.searchTerms) ? parsed.searchTerms : [],
      isFollowUp: parsed.isFollowUp || false,
    };
  } catch {
    // On any failure, use original query (don't block the chat)
    return {
      original: userMessage,
      reformulated: userMessage,
      searchTerms: [],
      isFollowUp: false,
    };
  }
}
