import { getGeminiClient, DEFAULT_CHAT_MODEL } from '@/lib/gemini/client';
import type { MatchedChunk } from '@/types';

export async function rerankChunks(
  query: string,
  chunks: MatchedChunk[],
  topK: number = 6
): Promise<MatchedChunk[]> {
  if (chunks.length <= topK) return chunks;

  const client = getGeminiClient();

  const chunkList = chunks
    .map((c, i) => `[${i}] ${c.content.slice(0, 300)}`)
    .join('\n\n');

  const prompt = `Given a user question, rank the following text passages by relevance. Return ONLY a JSON array of passage indices (numbers) from most to least relevant. Return at most ${topK} indices.

Question: "${query}"

Passages:
${chunkList}

Respond with a JSON array of indices, e.g. [3, 0, 5, 1, 2, 4]`;

  try {
    const result = await Promise.race([
      client.models.generateContent({
        model: DEFAULT_CHAT_MODEL,
        contents: prompt,
        config: {
          temperature: 0,
          maxOutputTokens: 200,
          responseMimeType: 'application/json',
        },
      }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Reranking timed out')), 8000)
      ),
    ]);

    const indices: number[] = JSON.parse(result.text || '[]');

    if (!Array.isArray(indices) || indices.length === 0) {
      return chunks.slice(0, topK);
    }

    // Return chunks in re-ranked order
    const reranked: MatchedChunk[] = [];
    const seen = new Set<number>();
    for (const idx of indices) {
      if (typeof idx === 'number' && idx >= 0 && idx < chunks.length && !seen.has(idx)) {
        reranked.push(chunks[idx]);
        seen.add(idx);
        if (reranked.length >= topK) break;
      }
    }

    // Fill remaining if needed
    if (reranked.length < topK) {
      for (let i = 0; i < chunks.length && reranked.length < topK; i++) {
        if (!seen.has(i)) reranked.push(chunks[i]);
      }
    }

    return reranked;
  } catch {
    // On failure, just return top K by original ranking
    return chunks.slice(0, topK);
  }
}
