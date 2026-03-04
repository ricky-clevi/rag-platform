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

function estimateTokens(text: string): number {
  return Math.ceil(text.length / CHAR_PER_TOKEN);
}

function generateSnippet(text: string, maxLength = 200): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (clean.length <= maxLength) return clean;
  return clean.slice(0, maxLength) + '...';
}

export function chunkText(
  text: string,
  _sourceUrl: string,
  _pageTitle: string
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
    const sectionChunks = splitBySize(
      section.content,
      targetChars,
      overlapChars
    );

    for (const chunkContent of sectionChunks) {
      if (chunkContent.trim().length < 50) continue;

      chunks.push({
        content: chunkContent.trim(),
        heading_path: section.heading || null,
        chunk_index: chunkIndex++,
        snippet: generateSnippet(chunkContent),
        token_count: estimateTokens(chunkContent),
      });
    }
  }

  return chunks;
}

interface Section {
  heading: string | null;
  content: string;
}

function splitBySections(text: string): Section[] {
  const lines = text.split('\n');
  const sections: Section[] = [];
  let currentHeading: string | null = null;
  let currentContent: string[] = [];

  for (const line of lines) {
    const headingMatch = line.match(/^##\s+(.+)$/);
    if (headingMatch) {
      if (currentContent.length > 0) {
        sections.push({
          heading: currentHeading,
          content: currentContent.join('\n'),
        });
      }
      currentHeading = headingMatch[1];
      currentContent = [];
    } else {
      currentContent.push(line);
    }
  }

  if (currentContent.length > 0) {
    sections.push({
      heading: currentHeading,
      content: currentContent.join('\n'),
    });
  }

  return sections.length > 0 ? sections : [{ heading: null, content: text }];
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
      chunks.push(currentChunk);

      const overlap = currentChunk.slice(-overlapSize);
      currentChunk = overlap + '\n\n' + paragraph;
    } else {
      currentChunk += (currentChunk ? '\n\n' : '') + paragraph;
    }
  }

  if (currentChunk.trim().length > 0) {
    chunks.push(currentChunk);
  }

  return chunks;
}
