import { getGeminiClient, DEFAULT_CHAT_MODEL } from '@/lib/gemini/client';
import { createServiceClient } from '@/lib/supabase/server';

export interface CompanyProfile {
  companyName: string;
  industry: string;
  description: string;
  keyProducts: string[];
  keyTopics: string[];
  tone: 'formal' | 'casual' | 'technical' | 'friendly';
  systemPrompt: string;
  welcomeMessage: string;
  starterQuestions: string[];
}

export async function generateCompanyProfile(agentId: string): Promise<CompanyProfile | null> {
  const supabase = createServiceClient();

  // Get agent info
  const { data: agent } = await supabase
    .from('agents')
    .select('name, root_url')
    .eq('id', agentId)
    .single();

  if (!agent) return null;

  // Get sample content: first 10 pages with most content
  const { data: pages } = await supabase
    .from('pages')
    .select('title, clean_markdown, url')
    .eq('agent_id', agentId)
    .eq('crawl_status', 'crawled')
    .not('clean_markdown', 'is', null)
    .order('raw_html_length', { ascending: false })
    .limit(10);

  if (!pages || pages.length === 0) return null;

  // Build sample content (truncated to avoid token limits)
  const sampleContent = pages
    .map(p => `--- Page: ${p.title || p.url} ---\n${(p.clean_markdown || '').slice(0, 1000)}`)
    .join('\n\n');

  const client = getGeminiClient();

  try {
    const result = await Promise.race([
      client.models.generateContent({
        model: DEFAULT_CHAT_MODEL,
        contents: `Analyze the following website content and create a company profile. This is content crawled from ${agent.root_url}.

Website Content:
${sampleContent}

Respond with valid JSON matching this schema:
{
  "companyName": "the company name",
  "industry": "the industry/sector",
  "description": "2-3 sentence description of what the company does",
  "keyProducts": ["product/service 1", "product/service 2", ...],
  "keyTopics": ["topic 1", "topic 2", ...] (what the AI agent can answer about),
  "tone": "formal" | "casual" | "technical" | "friendly",
  "systemPrompt": "A tailored system prompt for an AI assistant for this company. Include the company name, what they do, their key products/services, and instructions on tone. 3-5 sentences.",
  "welcomeMessage": "A warm welcome message for the chatbot, mentioning the company name and what it can help with. 1-2 sentences.",
  "starterQuestions": ["question 1", "question 2", "question 3", "question 4"] (4 relevant questions a visitor might ask)
}`,
        config: {
          temperature: 0.3,
          maxOutputTokens: 1024,
          responseMimeType: 'application/json',
        },
      }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Company profiling timed out')), 30000)
      ),
    ]);

    const parsed = JSON.parse(result.text || '{}');

    return {
      companyName: parsed.companyName || agent.name,
      industry: parsed.industry || 'Unknown',
      description: parsed.description || '',
      keyProducts: Array.isArray(parsed.keyProducts) ? parsed.keyProducts : [],
      keyTopics: Array.isArray(parsed.keyTopics) ? parsed.keyTopics : [],
      tone: ['formal', 'casual', 'technical', 'friendly'].includes(parsed.tone) ? parsed.tone : 'friendly',
      systemPrompt: parsed.systemPrompt || '',
      welcomeMessage: parsed.welcomeMessage || '',
      starterQuestions: Array.isArray(parsed.starterQuestions) ? parsed.starterQuestions.slice(0, 4) : [],
    };
  } catch (error) {
    console.error('Company profiling failed:', error);
    return null;
  }
}

export async function applyCompanyProfile(agentId: string, profile: CompanyProfile): Promise<void> {
  const supabase = createServiceClient();

  // Update agent name if it was auto-generated
  const { data: agent } = await supabase
    .from('agents')
    .select('name')
    .eq('id', agentId)
    .single();

  if (agent) {
    // Only update name if it looks auto-generated (matches domain pattern)
    const isAutoName = agent.name.includes('.') || agent.name.startsWith('Agent ');
    if (isAutoName && profile.companyName) {
      await supabase
        .from('agents')
        .update({ name: profile.companyName, description: profile.description })
        .eq('id', agentId);
    }
  }

  // Update agent settings
  await supabase
    .from('agent_settings')
    .update({
      system_prompt: profile.systemPrompt,
      welcome_message: profile.welcomeMessage,
      starter_questions: profile.starterQuestions,
    })
    .eq('agent_id', agentId);
}
