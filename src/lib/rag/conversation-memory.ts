import { getGeminiClient, DEFAULT_CHAT_MODEL } from '@/lib/gemini/client';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

export async function buildConversationContext(
  messages: Message[],
  maxRecentMessages: number = 4
): Promise<{ recentMessages: Message[]; summary: string | null; contextForSearch: string }> {
  if (messages.length <= maxRecentMessages) {
    return {
      recentMessages: messages,
      summary: null,
      contextForSearch: messages.map(m => m.content).join(' '),
    };
  }

  const recentMessages = messages.slice(-maxRecentMessages);
  const olderMessages = messages.slice(0, -maxRecentMessages);

  // Summarize older messages
  let summary: string | null = null;
  if (olderMessages.length > 0) {
    try {
      const client = getGeminiClient();
      const conversationText = olderMessages
        .map(m => `${m.role}: ${m.content}`)
        .join('\n');

      const result = await Promise.race([
        client.models.generateContent({
          model: DEFAULT_CHAT_MODEL,
          contents: `Summarize this conversation in 2-3 sentences, capturing the key topics discussed and any important facts mentioned:\n\n${conversationText}`,
          config: {
            temperature: 0.1,
            maxOutputTokens: 200,
          },
        }),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Summary timed out')), 5000)
        ),
      ]);

      summary = result.text || null;
    } catch {
      // On failure, just use last message as context
      summary = null;
    }
  }

  const contextForSearch = [
    summary || '',
    ...recentMessages.map(m => m.content),
  ].filter(Boolean).join(' ');

  return { recentMessages, summary, contextForSearch };
}
