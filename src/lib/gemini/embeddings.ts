import { getGeminiClient, EMBEDDING_MODEL, EMBEDDING_DIMENSIONS } from './client';

const EMBEDDING_TIMEOUT_MS = 30_000;
const MAX_RETRIES = 3;
const BATCH_SIZE = 100; // Process up to 100 texts per batch group
const CONCURRENT_BATCHES = 3; // Number of batch groups processed concurrently
const CONCURRENT_PER_BATCH = 25; // Concurrent API calls within each batch

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
      const delay = Math.min(1000 * Math.pow(2, attempt), 10000);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
  throw new Error('Unreachable');
}

/**
 * Embed a single text with retry and timeout.
 * Used for individual embeddings and as part of batch fallback.
 */
async function embedSingle(
  text: string,
  taskType: 'RETRIEVAL_DOCUMENT' | 'RETRIEVAL_QUERY' = 'RETRIEVAL_DOCUMENT'
): Promise<number[]> {
  const client = getGeminiClient();

  const result = await withRetry(() =>
    Promise.race([
      client.models.embedContent({
        model: EMBEDDING_MODEL,
        contents: text,
        config: {
          taskType,
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
    throw new Error(
      `Embedding dimension mismatch: expected ${EMBEDDING_DIMENSIONS}, got ${embedding.values.length}`
    );
  }

  return normalizeVector(embedding.values);
}

export async function generateEmbedding(text: string): Promise<number[]> {
  return embedSingle(text, 'RETRIEVAL_DOCUMENT');
}

export async function generateQueryEmbedding(query: string): Promise<number[]> {
  return embedSingle(query, 'RETRIEVAL_QUERY');
}

/**
 * Process items with a concurrency limit.
 * Runs up to `concurrency` async tasks at once.
 */
async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<R>
): Promise<PromiseSettledResult<R>[]> {
  const results: PromiseSettledResult<R>[] = new Array(items.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < items.length) {
      const idx = nextIndex++;
      try {
        const value = await fn(items[idx], idx);
        results[idx] = { status: 'fulfilled', value };
      } catch (reason) {
        results[idx] = { status: 'rejected', reason };
      }
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, items.length) }, () => worker());
  await Promise.all(workers);

  return results;
}

/**
 * True batch embedding with high concurrency and proper error handling.
 *
 * Instead of sequential one-at-a-time calls, this processes texts in parallel
 * batches with concurrency control (CONCURRENT_PER_BATCH * CONCURRENT_BATCHES
 * = up to 75 concurrent API calls), achieving 50-100x speedup.
 *
 * CRITICAL: Failed embeddings return empty arrays (NOT zero vectors).
 * Zero vectors match everything in cosine similarity and corrupt search results.
 */
export async function generateEmbeddingsBatch(
  texts: string[],
  options?: { onProgress?: (completed: number, total: number) => void }
): Promise<{ embeddings: number[][]; failedIndices: number[] }> {
  if (texts.length === 0) {
    return { embeddings: [], failedIndices: [] };
  }

  const client = getGeminiClient();
  const allEmbeddings: (number[] | null)[] = new Array(texts.length).fill(null);
  const failedIndices: number[] = [];

  // Split into batches of BATCH_SIZE
  const batches: { startIndex: number; texts: string[] }[] = [];
  for (let i = 0; i < texts.length; i += BATCH_SIZE) {
    batches.push({
      startIndex: i,
      texts: texts.slice(i, i + BATCH_SIZE),
    });
  }

  // Process batches with concurrency limit
  let completedCount = 0;

  for (let i = 0; i < batches.length; i += CONCURRENT_BATCHES) {
    const concurrentBatches = batches.slice(i, i + CONCURRENT_BATCHES);

    await Promise.allSettled(
      concurrentBatches.map(async (batch) => {
        // Process all texts in this batch concurrently (up to CONCURRENT_PER_BATCH at once)
        const results = await mapWithConcurrency(
          batch.texts,
          CONCURRENT_PER_BATCH,
          async (text) => {
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
                  setTimeout(
                    () => reject(new Error('Embedding timed out')),
                    EMBEDDING_TIMEOUT_MS
                  )
                ),
              ])
            );
            return result;
          }
        );

        // Process results
        for (let j = 0; j < results.length; j++) {
          const globalIdx = batch.startIndex + j;
          const r = results[j];
          if (r.status === 'fulfilled') {
            const emb = r.value.embeddings?.[0];
            if (emb?.values) {
              allEmbeddings[globalIdx] = normalizeVector(emb.values);
            } else {
              failedIndices.push(globalIdx);
            }
          } else {
            failedIndices.push(globalIdx);
          }
        }

        completedCount += batch.texts.length;
        options?.onProgress?.(completedCount, texts.length);
      })
    );

    // Small delay between batch groups to avoid rate limits
    if (i + CONCURRENT_BATCHES < batches.length) {
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
  }

  // Retry failed indices individually (one more chance with reduced retries)
  if (failedIndices.length > 0 && failedIndices.length < texts.length * 0.5) {
    const retryResults = await mapWithConcurrency(
      failedIndices,
      5, // Lower concurrency for retries to be gentler on rate limits
      async (idx) => {
        const result = await withRetry(
          () =>
            Promise.race([
              client.models.embedContent({
                model: EMBEDDING_MODEL,
                contents: texts[idx],
                config: {
                  taskType: 'RETRIEVAL_DOCUMENT',
                  outputDimensionality: EMBEDDING_DIMENSIONS,
                },
              }),
              new Promise<never>((_, reject) =>
                setTimeout(
                  () => reject(new Error('Retry embedding timed out')),
                  EMBEDDING_TIMEOUT_MS
                )
              ),
            ]),
          1 // Only 1 retry on the retry pass
        );
        return { idx, result };
      }
    );

    const stillFailed: number[] = [];
    for (let i = 0; i < retryResults.length; i++) {
      const idx = failedIndices[i];
      const r = retryResults[i];
      if (r.status === 'fulfilled' && r.value.result.embeddings?.[0]?.values) {
        allEmbeddings[idx] = normalizeVector(r.value.result.embeddings[0].values);
      } else {
        stillFailed.push(idx);
      }
    }

    failedIndices.length = 0;
    failedIndices.push(...stillFailed);
  }

  return {
    embeddings: allEmbeddings.map((e) => e || []), // Empty array for truly failed (NOT zero vector)
    failedIndices,
  };
}
