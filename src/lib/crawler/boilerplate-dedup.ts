import { createHash } from 'crypto';

/**
 * Boilerplate deduplication across chunks within an agent.
 * Identifies and removes near-identical content that appears across many pages
 * (headers, footers, navigation text, cookie notices, etc.)
 */

interface ChunkFingerprint {
  hash: string;
  content: string;
  pageCount: number;
  pages: Set<string>;
}

const SHINGLE_SIZE = 3;
const SIMILARITY_THRESHOLD = 0.85;
const MIN_OCCURRENCE_FOR_BOILERPLATE = 3;

/**
 * Generate word-level shingles for a text.
 */
function getShingles(text: string, size: number = SHINGLE_SIZE): Set<string> {
  const words = text.toLowerCase().split(/\s+/).filter(Boolean);
  const shingles = new Set<string>();
  for (let i = 0; i <= words.length - size; i++) {
    shingles.add(words.slice(i, i + size).join(' '));
  }
  return shingles;
}

/**
 * Compute Jaccard similarity between two shingle sets.
 */
function jaccardSimilarity(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 1;
  let intersection = 0;
  for (const s of a) {
    if (b.has(s)) intersection++;
  }
  const union = a.size + b.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

/**
 * Content hash for exact dedup.
 */
function contentHash(text: string): string {
  const normalized = text.toLowerCase().replace(/\s+/g, ' ').trim();
  return createHash('md5').update(normalized).digest('hex');
}

/**
 * Build a boilerplate fingerprint database from all chunks.
 * Returns hashes of content that appears across too many different pages.
 */
export function detectBoilerplate(
  chunks: { content: string; pageUrl: string }[]
): Set<string> {
  const fingerprints = new Map<string, ChunkFingerprint>();

  for (const chunk of chunks) {
    const hash = contentHash(chunk.content);
    const existing = fingerprints.get(hash);
    if (existing) {
      existing.pages.add(chunk.pageUrl);
      existing.pageCount = existing.pages.size;
    } else {
      fingerprints.set(hash, {
        hash,
        content: chunk.content,
        pageCount: 1,
        pages: new Set([chunk.pageUrl]),
      });
    }
  }

  // Mark exact duplicates appearing on many pages
  const boilerplateHashes = new Set<string>();
  for (const [hash, fp] of fingerprints) {
    if (fp.pageCount >= MIN_OCCURRENCE_FOR_BOILERPLATE) {
      boilerplateHashes.add(hash);
    }
  }

  // Also check near-duplicates using shingles
  const uniqueContents = [...fingerprints.values()].filter(
    (fp) => fp.pageCount < MIN_OCCURRENCE_FOR_BOILERPLATE
  );
  const boilerplateShingles = [...fingerprints.values()]
    .filter((fp) => fp.pageCount >= MIN_OCCURRENCE_FOR_BOILERPLATE)
    .map((fp) => ({ hash: fp.hash, shingles: getShingles(fp.content) }));

  for (const item of uniqueContents) {
    const itemShingles = getShingles(item.content);
    for (const bp of boilerplateShingles) {
      if (jaccardSimilarity(itemShingles, bp.shingles) >= SIMILARITY_THRESHOLD) {
        boilerplateHashes.add(item.hash);
        break;
      }
    }
  }

  return boilerplateHashes;
}

/**
 * Filter out boilerplate chunks from a list.
 */
export function filterBoilerplate(
  chunks: { content: string; pageUrl: string; [key: string]: unknown }[],
  boilerplateHashes: Set<string>
): typeof chunks {
  return chunks.filter((chunk) => {
    const hash = contentHash(chunk.content);
    return !boilerplateHashes.has(hash);
  });
}

/**
 * Check if a single chunk is likely boilerplate based on content patterns.
 */
export function isLikelyBoilerplate(content: string): boolean {
  const lower = content.toLowerCase().trim();

  // Very short content that's likely navigation/UI text
  if (lower.length < 30) return true;

  // Common boilerplate patterns
  const boilerplatePatterns = [
    /^(copyright|©)\s/i,
    /^all rights reserved/i,
    /^terms (of|and) (service|use|conditions)/i,
    /^privacy policy/i,
    /^cookie (policy|notice|consent)/i,
    /^(follow|connect with) us on/i,
    /^(subscribe|sign up) (to|for) (our|the) newsletter/i,
    /^(back to top|scroll to top)/i,
    /^(skip to|jump to) (main )?content/i,
    /^(home|about|contact|blog|faq|support|careers|press)\s*$/i,
  ];

  return boilerplatePatterns.some((p) => p.test(lower));
}
