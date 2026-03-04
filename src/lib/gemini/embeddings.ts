import { getGeminiClient, EMBEDDING_MODEL } from './client';

export async function generateEmbedding(text: string): Promise<number[]> {
  const client = getGeminiClient();

  const result = await client.models.embedContent({
    model: EMBEDDING_MODEL,
    contents: text,
    config: {
      taskType: 'RETRIEVAL_DOCUMENT',
    },
  });

  const embedding = result.embeddings?.[0];
  if (!embedding?.values) {
    throw new Error('Failed to generate embedding');
  }

  return embedding.values;
}

export async function generateQueryEmbedding(query: string): Promise<number[]> {
  const client = getGeminiClient();

  const result = await client.models.embedContent({
    model: EMBEDDING_MODEL,
    contents: query,
    config: {
      taskType: 'RETRIEVAL_QUERY',
    },
  });

  const embedding = result.embeddings?.[0];
  if (!embedding?.values) {
    throw new Error('Failed to generate embedding');
  }

  return embedding.values;
}

export async function generateEmbeddingsBatch(
  texts: string[]
): Promise<number[][]> {
  // Process in batches of 100 to avoid rate limits
  const batchSize = 100;
  const embeddings: number[][] = [];

  for (let i = 0; i < texts.length; i += batchSize) {
    const batch = texts.slice(i, i + batchSize);
    const results = await Promise.all(
      batch.map((text) => generateEmbedding(text))
    );
    embeddings.push(...results);

    // Small delay between batches to avoid rate limiting
    if (i + batchSize < texts.length) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }

  return embeddings;
}
