import { getGeminiClient, ESCALATION_CHAT_MODEL } from './client';

/**
 * Live verification mode (#36): Uses Gemini URL Context + Google Search grounding
 * to verify freshness of information when a user asks about recent changes.
 */

const FRESHNESS_KEYWORDS = [
  'latest', 'recent', 'new', 'updated', 'current', 'today',
  'this week', 'this month', 'changed', 'announced',
  'pricing', 'price change', 'launch', 'release',
  '최근', '최신', '새로운', '업데이트', '변경', '발표',
];

/**
 * Check if a query likely requires fresh/live data.
 */
export function needsLiveVerification(query: string): boolean {
  const lower = query.toLowerCase();
  return FRESHNESS_KEYWORDS.some((kw) => lower.includes(kw));
}

/**
 * Perform live verification using Gemini with URL Context and Search grounding.
 * Returns supplementary context to merge with RAG results.
 */
export async function liveVerify(
  query: string,
  companyUrl: string,
  existingAnswer: string
): Promise<{
  verification: string;
  isStale: boolean;
  updatedInfo?: string;
}> {
  const client = getGeminiClient();

  try {
    const response = await client.models.generateContent({
      model: ESCALATION_CHAT_MODEL,
      contents: [
        {
          role: 'user',
          parts: [
            {
              text: `I have an existing answer about a company (${companyUrl}) but need to verify if it's still current.

Question: ${query}

Existing answer from cached data:
${existingAnswer}

Please check if this information is still accurate and up-to-date. If you find newer information, provide it.

Respond in JSON:
{
  "verification": "Your assessment of whether the cached answer is still accurate",
  "is_stale": true/false,
  "updated_info": "Updated information if the cached data is stale, or null"
}`,
            },
          ],
        },
      ],
      config: {
        responseMimeType: 'application/json',
        temperature: 0.2,
        maxOutputTokens: 2048,
        tools: [
          { googleSearch: {} },
          { urlContext: {} },
        ],
      },
    });

    const raw = response.text || '';
    try {
      const parsed = JSON.parse(raw);
      return {
        verification: parsed.verification || '',
        isStale: parsed.is_stale || false,
        updatedInfo: parsed.updated_info || undefined,
      };
    } catch {
      return {
        verification: raw,
        isStale: false,
      };
    }
  } catch (error) {
    console.error('Live verification failed:', error);
    return {
      verification: 'Live verification unavailable',
      isStale: false,
    };
  }
}

/**
 * Generate starter questions about a company using Gemini (#39).
 */
export async function generateStarterQuestions(
  companyName: string,
  companyUrl: string,
  sampleContent: string
): Promise<string[]> {
  const client = getGeminiClient();

  try {
    const response = await client.models.generateContent({
      model: ESCALATION_CHAT_MODEL,
      contents: [
        {
          role: 'user',
          parts: [
            {
              text: `You are helping create an AI chatbot for the company "${companyName}" (${companyUrl}).

Based on the following sample content from their website, generate 4 engaging starter questions that a visitor might want to ask this company's AI assistant. The questions should:
1. Be specific to this company
2. Cover different topics (products/services, company info, how-to, general)
3. Be concise and natural-sounding
4. Be answerable from the company's public website content

Sample content from the website:
${sampleContent.slice(0, 3000)}

Respond with a JSON array of exactly 4 question strings:
["question 1", "question 2", "question 3", "question 4"]`,
            },
          ],
        },
      ],
      config: {
        responseMimeType: 'application/json',
        temperature: 0.7,
        maxOutputTokens: 512,
      },
    });

    const raw = response.text || '';
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed.slice(0, 4);
      }
    } catch {
      // fallback
    }

    return [
      `What does ${companyName} do?`,
      `What products or services does ${companyName} offer?`,
      `How can I contact ${companyName}?`,
      `Tell me about ${companyName}'s team.`,
    ];
  } catch (error) {
    console.error('Starter question generation failed:', error);
    return [
      `What does ${companyName} do?`,
      `What products or services does ${companyName} offer?`,
      `How can I contact ${companyName}?`,
      `Tell me about ${companyName}'s team.`,
    ];
  }
}
