import { getGeminiClient, EMBEDDING_MODEL, EMBEDDING_DIMENSIONS } from './client';

const EMBEDDING_TIMEOUT_MS = 30_000;
const MAX_RETRIES = 2;

function normalizeVector(vec: number[]): number[] {
  const magnitude = Math.sqrt(vec.reduce((sum, v) => sum + v * v, 0));
  if (magnitude === 0) return vec;
  return vec.map((v) => v / magnitude);
}

async function withRetry<T>(fn: () => Promise<T>, retries = MAX_RETRIES): Promise<T> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      if (attempt === retries) throw error;
      // Exponential backoff: 500ms, 1000ms
      await new Promise((resolve) => setTimeout(resolve, 500 * (attempt + 1)));
    }
  }
  throw new Error('Unreachable');
}

export async function generateEmbedding(text: string): Promise<number[]> {
  const client = getGeminiClient();

  const result = await withRetry(() =>
    Promise.race([
      client.models.embedContent({
        model: EMBEDDING_MODEL,
        contents: text,
        config: {
          taskType: 'RETRIEVAL_DOCUMENT',
          outputDimensionality: EMBEDDING_DIMENSIONS,
        },
      }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Embedding request timed out')), EMBEDDING_TIMEOUT_MS)
      ),
    ])
  );

  const embedding = result.embeddings?.[0];
  if (!embedding?.values) {
    throw new Error('Failed to generate embedding');
  }
  if (embedding.values.length !== EMBEDDING_DIMENSIONS) {
    throw new Error(`Embedding dimension mismatch: expected ${EMBEDDING_DIMENSIONS}, got ${embedding.values.length}`);
  }

  return normalizeVector(embedding.values);
}

export async function generateQueryEmbedding(query: string): Promise<number[]> {
  const client = getGeminiClient();

  const result = await withRetry(() =>
    Promise.race([
      client.models.embedContent({
        model: EMBEDDING_MODEL,
        contents: query,
        config: {
          taskType: 'RETRIEVAL_QUERY',
          outputDimensionality: EMBEDDING_DIMENSIONS,
        },
      }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Query embedding request timed out')), EMBEDDING_TIMEOUT_MS)
      ),
    ])
  );

  const embedding = result.embeddings?.[0];
  if (!embedding?.values) {
    throw new Error('Failed to generate embedding');
  }
  if (embedding.values.length !== EMBEDDING_DIMENSIONS) {
    throw new Error(`Query embedding dimension mismatch: expected ${EMBEDDING_DIMENSIONS}, got ${embedding.values.length}`);
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
    // Use allSettled to avoid losing the whole batch on a single failure
    const results = await Promise.allSettled(
      batch.map((text) => generateEmbedding(text))
    );
    for (const result of results) {
      if (result.status === 'fulfilled') {
        embeddings.push(result.value);
      } else {
        console.error('Embedding failed for batch item:', result.reason);
        // Push zero vector as placeholder so indices stay aligned
        embeddings.push(new Array(EMBEDDING_DIMENSIONS).fill(0));
      }
    }

    if (i + batchSize < texts.length) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }

  return embeddings;
}
