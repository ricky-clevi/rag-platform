import { getGeminiClient, EMBEDDING_MODEL, EMBEDDING_DIMENSIONS } from './client';

function normalizeVector(vec: number[]): number[] {
  const magnitude = Math.sqrt(vec.reduce((sum, v) => sum + v * v, 0));
  if (magnitude === 0) return vec;
  return vec.map((v) => v / magnitude);
}

export async function generateEmbedding(text: string): Promise<number[]> {
  const client = getGeminiClient();

  const result = await client.models.embedContent({
    model: EMBEDDING_MODEL,
    contents: text,
    config: {
      taskType: 'RETRIEVAL_DOCUMENT',
      outputDimensionality: EMBEDDING_DIMENSIONS,
    },
  });

  const embedding = result.embeddings?.[0];
  if (!embedding?.values) {
    throw new Error('Failed to generate embedding');
  }

  return normalizeVector(embedding.values);
}

export async function generateQueryEmbedding(query: string): Promise<number[]> {
  const client = getGeminiClient();

  const result = await client.models.embedContent({
    model: EMBEDDING_MODEL,
    contents: query,
    config: {
      taskType: 'RETRIEVAL_QUERY',
      outputDimensionality: EMBEDDING_DIMENSIONS,
    },
  });

  const embedding = result.embeddings?.[0];
  if (!embedding?.values) {
    throw new Error('Failed to generate embedding');
  }

  return normalizeVector(embedding.values);
}

export async function generateEmbeddingsBatch(
  texts: string[]
): Promise<number[][]> {
  const batchSize = 100;
  const embeddings: number[][] = [];

  for (let i = 0; i < texts.length; i += batchSize) {
    const batch = texts.slice(i, i + batchSize);
    const results = await Promise.all(
      batch.map((text) => generateEmbedding(text))
    );
    embeddings.push(...results);

    if (i + batchSize < texts.length) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }

  return embeddings;
}
