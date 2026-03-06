export interface TextChunk {
  content: string;
  heading_path: string | null;
  chunk_index: number;
  snippet: string | null;
  token_count: number;
}

const TARGET_CHUNK_SIZE = 500; // ~500 tokens (roughly 2000 chars)
const CHUNK_OVERLAP = 50; // ~50 tokens overlap (roughly 200 chars)
const CHAR_PER_TOKEN = 4;
const MIN_CHUNK_LENGTH = 80;

function estimateTokens(text: string): number {
  return Math.ceil(text.length / CHAR_PER_TOKEN);
}

function generateSnippet(text: string, maxLength = 200): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (clean.length <= maxLength) return clean;
  return clean.slice(0, maxLength) + '...';
}

/**
 * Detect FAQ patterns and extract Q&A pairs.
 * Returns null if content is not FAQ-like.
 */
function extractFaqChunks(
  text: string,
  pageTitle: string,
  headingPath: string | null,
  startIndex: number
): TextChunk[] | null {
  // Match Q:/A: patterns
  const qaPattern = /(?:^|\n)\s*Q:\s*(.+?)(?:\n\s*A:\s*([\s\S]+?))?(?=\n\s*Q:|\s*$)/gi;
  const matches = [...text.matchAll(qaPattern)];
  if (matches.length >= 2) {
    const chunks: TextChunk[] = [];
    let idx = startIndex;
    for (const match of matches) {
      const question = match[1]?.trim();
      const answer = match[2]?.trim();
      if (question) {
        const content = answer ? `Q: ${question}\nA: ${answer}` : `Q: ${question}`;
        const prefix = buildChunkPrefix(pageTitle, headingPath);
        const prefixedContent = prefix ? `${prefix}\n\n${content}` : content;
        if (prefixedContent.trim().length >= MIN_CHUNK_LENGTH) {
          chunks.push({
            content: prefixedContent.trim(),
            heading_path: headingPath,
            chunk_index: idx++,
            snippet: generateSnippet(prefixedContent),
            token_count: estimateTokens(prefixedContent),
          });
        }
      }
    }
    if (chunks.length > 0) return chunks;
  }

  // Match question/answer-like patterns (lines ending with ? followed by answer text)
  const lines = text.split('\n');
  const qaPairs: { question: string; answer: string }[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line.endsWith('?') && line.length > 15) {
      // Collect answer lines until next question or end
      const answerLines: string[] = [];
      for (let j = i + 1; j < lines.length; j++) {
        const nextLine = lines[j].trim();
        if (nextLine.endsWith('?') && nextLine.length > 15) break;
        if (nextLine.length > 0) answerLines.push(nextLine);
      }
      if (answerLines.length > 0) {
        qaPairs.push({ question: line, answer: answerLines.join(' ') });
      }
    }
  }

  if (qaPairs.length >= 3) {
    const chunks: TextChunk[] = [];
    let idx = startIndex;
    for (const pair of qaPairs) {
      const content = `Q: ${pair.question}\nA: ${pair.answer}`;
      const prefix = buildChunkPrefix(pageTitle, headingPath);
      const prefixedContent = prefix ? `${prefix}\n\n${content}` : content;
      if (prefixedContent.trim().length >= MIN_CHUNK_LENGTH) {
        chunks.push({
          content: prefixedContent.trim(),
          heading_path: headingPath,
          chunk_index: idx++,
          snippet: generateSnippet(prefixedContent),
          token_count: estimateTokens(prefixedContent),
        });
      }
    }
    if (chunks.length > 0) return chunks;
  }

  return null;
}

/**
 * Build a prefix with page title and heading path for context.
 */
function buildChunkPrefix(pageTitle: string, headingPath: string | null): string {
  const parts: string[] = [];
  if (pageTitle) parts.push(pageTitle);
  if (headingPath) parts.push(headingPath);
  if (parts.length === 0) return '';
  return `[${parts.join(' > ')}]`;
}

export function chunkText(
  text: string,
  _sourceUrl: string,
  pageTitle: string
): TextChunk[] {
  if (!text || text.trim().length === 0) {
    return [];
  }

  const targetChars = TARGET_CHUNK_SIZE * CHAR_PER_TOKEN;
  const overlapChars = CHUNK_OVERLAP * CHAR_PER_TOKEN;

  const sections = splitBySections(text);
  const chunks: TextChunk[] = [];
  let chunkIndex = 0;

  for (const section of sections) {
    // Try FAQ detection first
    const faqChunks = extractFaqChunks(section.content, pageTitle, section.headingPath, chunkIndex);
    if (faqChunks) {
      chunks.push(...faqChunks);
      chunkIndex += faqChunks.length;
      continue;
    }

    const sectionChunks = splitBySize(
      section.content,
      targetChars,
      overlapChars
    );

    for (const chunkContent of sectionChunks) {
      if (chunkContent.trim().length < MIN_CHUNK_LENGTH) continue;

      const prefix = buildChunkPrefix(pageTitle, section.headingPath);
      const prefixedContent = prefix ? `${prefix}\n\n${chunkContent.trim()}` : chunkContent.trim();

      chunks.push({
        content: prefixedContent,
        heading_path: section.headingPath,
        chunk_index: chunkIndex++,
        snippet: generateSnippet(chunkContent),
        token_count: estimateTokens(prefixedContent),
      });
    }
  }

  return chunks;
}

interface Section {
  headingPath: string | null;
  content: string;
}

/**
 * Split text into sections by headings, tracking heading hierarchy.
 * Builds a breadcrumb like "h1 > h2 > h3" for each section.
 */
function splitBySections(text: string): Section[] {
  const lines = text.split('\n');
  const sections: Section[] = [];

  // Track heading hierarchy: h1 (##), h2 (###), h3 (####), etc.
  const headingStack: { level: number; text: string }[] = [];
  let currentContent: string[] = [];

  function getCurrentHeadingPath(): string | null {
    if (headingStack.length === 0) return null;
    return headingStack.map(h => h.text).join(' > ');
  }

  function pushSection() {
    if (currentContent.length > 0) {
      const content = currentContent.join('\n');
      if (content.trim().length > 0) {
        sections.push({
          headingPath: getCurrentHeadingPath(),
          content,
        });
      }
    }
    currentContent = [];
  }

  for (const line of lines) {
    // Match ## heading, ### heading, #### heading, etc.
    const headingMatch = line.match(/^(#{2,6})\s+(.+)$/);
    if (headingMatch) {
      // Push the current section before starting a new one
      pushSection();

      const level = headingMatch[1].length; // 2 for ##, 3 for ###, etc.
      const headingText = headingMatch[2].trim();

      // Pop headings that are at the same or deeper level
      while (headingStack.length > 0 && headingStack[headingStack.length - 1].level >= level) {
        headingStack.pop();
      }
      headingStack.push({ level, text: headingText });
    } else {
      currentContent.push(line);
    }
  }

  // Push final section
  pushSection();

  return sections.length > 0 ? sections : [{ headingPath: null, content: text }];
}

/**
 * Find the nearest sentence boundary at or before the given position.
 */
function findSentenceBoundary(text: string, position: number): number {
  // Look backward from position for a sentence-ending punctuation
  const searchRegion = text.slice(0, position);
  const sentenceEnders = /[.!?]\s/g;
  let lastMatch = -1;
  let match;

  while ((match = sentenceEnders.exec(searchRegion)) !== null) {
    lastMatch = match.index + 1; // Include the punctuation mark
  }

  // If we found a sentence boundary in the last 30% of the chunk, use it
  const minPosition = position * 0.7;
  if (lastMatch > minPosition) {
    return lastMatch;
  }

  // If no good sentence boundary, return original position
  return position;
}

function splitBySize(
  text: string,
  targetSize: number,
  overlapSize: number
): string[] {
  if (text.length <= targetSize) {
    return [text];
  }

  const chunks: string[] = [];
  const paragraphs = text.split(/\n\n+/);
  let currentChunk = '';

  for (const paragraph of paragraphs) {
    if (currentChunk.length + paragraph.length > targetSize && currentChunk.length > 0) {
      // Try to split at sentence boundary
      if (currentChunk.length > targetSize) {
        const boundary = findSentenceBoundary(currentChunk, targetSize);
        const part1 = currentChunk.slice(0, boundary).trim();
        const remainder = currentChunk.slice(boundary).trim();

        if (part1.length >= MIN_CHUNK_LENGTH) {
          chunks.push(part1);
        }

        const overlap = part1.slice(-overlapSize);
        currentChunk = remainder
          ? overlap + '\n\n' + remainder + '\n\n' + paragraph
          : overlap + '\n\n' + paragraph;
      } else {
        chunks.push(currentChunk);
        const overlap = currentChunk.slice(-overlapSize);
        currentChunk = overlap + '\n\n' + paragraph;
      }
    } else {
      currentChunk += (currentChunk ? '\n\n' : '') + paragraph;
    }
  }

  if (currentChunk.trim().length > 0) {
    // Handle final chunk if it's too large
    if (currentChunk.length > targetSize) {
      const boundary = findSentenceBoundary(currentChunk, targetSize);
      const part1 = currentChunk.slice(0, boundary).trim();
      const part2 = currentChunk.slice(boundary).trim();

      if (part1.length >= MIN_CHUNK_LENGTH) chunks.push(part1);
      if (part2.length >= MIN_CHUNK_LENGTH) chunks.push(part2);
    } else {
      chunks.push(currentChunk);
    }
  }

  return chunks;
}
