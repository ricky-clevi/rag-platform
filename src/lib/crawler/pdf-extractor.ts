import { getGeminiClient } from '@/lib/gemini/client';

/**
 * Extract text content from a PDF buffer using Gemini's document processing.
 * Falls back to basic binary-to-text extraction if Gemini is unavailable.
 */
export async function extractPdfText(
  pdfBuffer: Buffer,
  url: string
): Promise<{ title: string; text: string; language: string }> {
  // Try Gemini-based PDF extraction first
  try {
    const client = getGeminiClient();

    const base64Data = pdfBuffer.toString('base64');

    const response = await client.models.generateContent({
      model: 'gemini-3.1-flash-lite-preview',
      contents: [
        {
          role: 'user',
          parts: [
            {
              inlineData: {
                mimeType: 'application/pdf',
                data: base64Data,
              },
            },
            {
              text: `Extract all text content from this PDF document. Return a JSON object with:
- "title": the document title (from metadata or first heading)
- "text": the full text content with headings preserved as markdown (## for h2, ### for h3, etc.)
- "language": the primary language code (e.g., "en", "ko")

Return ONLY valid JSON, no other text.`,
            },
          ],
        },
      ],
      config: {
        responseMimeType: 'application/json',
        temperature: 0.1,
        maxOutputTokens: 65536,
      },
    });

    const raw = response.text || '';
    try {
      const parsed = JSON.parse(raw);
      return {
        title: parsed.title || extractTitleFromUrl(url),
        text: parsed.text || '',
        language: parsed.language || 'en',
      };
    } catch {
      // If JSON parsing fails, use the raw text
      return {
        title: extractTitleFromUrl(url),
        text: raw,
        language: 'en',
      };
    }
  } catch (error) {
    console.error('Gemini PDF extraction failed, using fallback:', error);
    return fallbackPdfExtraction(pdfBuffer, url);
  }
}

/**
 * Fallback: basic text extraction from PDF binary by finding text streams.
 */
function fallbackPdfExtraction(
  pdfBuffer: Buffer,
  url: string
): { title: string; text: string; language: string } {
  const raw = pdfBuffer.toString('utf-8', 0, Math.min(pdfBuffer.length, 5_000_000));

  // Extract text between BT and ET markers (PDF text objects)
  const textParts: string[] = [];
  const textRegex = /\(([^)]+)\)\s*Tj/g;
  let match;
  while ((match = textRegex.exec(raw)) !== null) {
    const decoded = match[1]
      .replace(/\\n/g, '\n')
      .replace(/\\r/g, '')
      .replace(/\\t/g, ' ')
      .replace(/\\\(/g, '(')
      .replace(/\\\)/g, ')')
      .replace(/\\\\/g, '\\');
    if (decoded.trim()) {
      textParts.push(decoded.trim());
    }
  }

  // Also try to find readable text sequences
  const readableRegex = /[\x20-\x7E]{20,}/g;
  while ((match = readableRegex.exec(raw)) !== null) {
    const text = match[0].trim();
    if (text && !text.includes('<<') && !text.includes('>>') && !text.includes('/Type')) {
      textParts.push(text);
    }
  }

  const text = [...new Set(textParts)].join('\n').trim();

  return {
    title: extractTitleFromUrl(url),
    text: text || '[PDF content could not be extracted]',
    language: 'en',
  };
}

function extractTitleFromUrl(url: string): string {
  try {
    const pathname = new URL(url).pathname;
    const filename = pathname.split('/').pop() || '';
    return filename.replace(/\.pdf$/i, '').replace(/[-_]/g, ' ') || 'PDF Document';
  } catch {
    return 'PDF Document';
  }
}

/**
 * Check if a buffer is within Gemini's PDF size limit (50MB).
 */
export function isPdfWithinLimit(buffer: Buffer): boolean {
  return buffer.length <= 50 * 1024 * 1024;
}
