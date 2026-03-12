import { DEFAULT_CHAT_MODEL, tryGetGeminiClient } from '@/lib/gemini/client';
import { createServiceClient } from '@/lib/supabase/server';
import type { CompanyFaqFact, CompanyProfileData, CompanyProfileFact } from '@/types';

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
  companyProfile: CompanyProfileData;
}

interface SourcePage {
  id: string;
  url: string;
  title: string | null;
  clean_markdown: string | null;
}

export interface ProfilePseudoChunkInput {
  pageId: string | null;
  headingPath: string;
  content: string;
  contextPrefix: string;
}

function normalizeText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function resolveSourceIndex(
  sourceIndex: unknown,
  pages: SourcePage[]
): { source_page_id?: string | null; source_url?: string | null } {
  if (typeof sourceIndex !== 'number' || sourceIndex < 0 || sourceIndex >= pages.length) {
    return {};
  }

  const page = pages[sourceIndex];
  return {
    source_page_id: page.id,
    source_url: page.url,
  };
}

function hydrateFact(
  raw: unknown,
  pages: SourcePage[]
): CompanyProfileFact | null {
  if (!raw || typeof raw !== 'object') {
    return null;
  }

  const fact = raw as { value?: unknown; source_index?: unknown };
  const value = normalizeText(fact.value);
  if (!value) {
    return null;
  }

  return {
    value,
    ...resolveSourceIndex(fact.source_index, pages),
  };
}

function hydrateFaq(
  raw: unknown,
  pages: SourcePage[]
): CompanyFaqFact | null {
  if (!raw || typeof raw !== 'object') {
    return null;
  }

  const faq = raw as { question?: unknown; answer?: unknown; source_index?: unknown };
  const question = normalizeText(faq.question);
  const answer = normalizeText(faq.answer);
  if (!question || !answer) {
    return null;
  }

  return {
    question,
    answer,
    ...resolveSourceIndex(faq.source_index, pages),
  };
}

function hydrateFactArray(raw: unknown, pages: SourcePage[]): CompanyProfileFact[] {
  if (!Array.isArray(raw)) {
    return [];
  }

  return raw
    .map((entry) => hydrateFact(entry, pages))
    .filter((entry): entry is CompanyProfileFact => Boolean(entry));
}

function hydrateFaqArray(raw: unknown, pages: SourcePage[]): CompanyFaqFact[] {
  if (!Array.isArray(raw)) {
    return [];
  }

  return raw
    .map((entry) => hydrateFaq(entry, pages))
    .filter((entry): entry is CompanyFaqFact => Boolean(entry));
}

function buildFallbackCompanyProfile(
  agentName: string,
  pages: SourcePage[],
  parsed: Record<string, unknown>
): CompanyProfileData {
  const sourcePage = pages[0];
  const description = normalizeText(parsed.description);
  const industry = normalizeText(parsed.industry);
  const keyProducts = Array.isArray(parsed.keyProducts)
    ? parsed.keyProducts.filter((entry): entry is string => typeof entry === 'string')
    : [];

  return {
    company_name: normalizeText(parsed.companyName) || agentName,
    industry: industry ? { value: industry, source_page_id: sourcePage?.id, source_url: sourcePage?.url } : null,
    description: description ? { value: description, source_page_id: sourcePage?.id, source_url: sourcePage?.url } : null,
    products: keyProducts.map((value) => ({
      value,
      source_page_id: sourcePage?.id,
      source_url: sourcePage?.url,
    })),
    team: [],
    faqs: [],
    contact: null,
    generated_at: new Date().toISOString(),
  };
}

export async function generateCompanyProfile(agentId: string): Promise<CompanyProfile | null> {
  const supabase = createServiceClient();

  const { data: agent } = await supabase
    .from('agents')
    .select('name, root_url')
    .eq('id', agentId)
    .single();

  if (!agent) return null;

  const { data: pages } = await supabase
    .from('pages')
    .select('id, title, clean_markdown, url')
    .eq('agent_id', agentId)
    .eq('crawl_status', 'crawled')
    .not('clean_markdown', 'is', null)
    .order('raw_html_length', { ascending: false })
    .limit(10);

  if (!pages || pages.length === 0) return null;

  const samplePages = (pages as SourcePage[]).map((page, index) => (
    `--- Source ${index} ---\nURL: ${page.url}\nTitle: ${page.title || page.url}\n${(page.clean_markdown || '').slice(0, 1600)}`
  )).join('\n\n');

  const client = tryGetGeminiClient();
  if (!client) {
    return null;
  }

  try {
    const result = await Promise.race([
      client.models.generateContent({
        model: DEFAULT_CHAT_MODEL,
        contents: `Analyze the following crawled website content for ${agent.root_url} and produce a company profile.

Return valid JSON with this exact shape:
{
  "companyName": "string",
  "industry": "string",
  "description": "string",
  "keyProducts": ["string"],
  "keyTopics": ["string"],
  "tone": "formal" | "casual" | "technical" | "friendly",
  "systemPrompt": "string",
  "welcomeMessage": "string",
  "starterQuestions": ["string"],
  "company_profile": {
    "company_name": "string",
    "industry": { "value": "string", "source_index": 0 },
    "description": { "value": "string", "source_index": 0 },
    "products": [{ "value": "string", "source_index": 0 }],
    "team": [{ "value": "string", "source_index": 0 }],
    "faqs": [{ "question": "string", "answer": "string", "source_index": 0 }],
    "contact": {
      "email": { "value": "string", "source_index": 0 },
      "phone": { "value": "string", "source_index": 0 },
      "address": { "value": "string", "source_index": 0 }
    }
  }
}

Rules:
- source_index must refer to the numbered sources above.
- Do not invent products, team members, or FAQs that are not supported by the sources.
- Keep descriptions concise and factual.

Website content:
${samplePages}`,
        config: {
          temperature: 0.2,
          maxOutputTokens: 2048,
          responseMimeType: 'application/json',
        },
      }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Company profiling timed out')), 30_000)
      ),
    ]);

    const parsed = JSON.parse(result.text || '{}') as Record<string, unknown>;
    const rawProfile =
      parsed.company_profile && typeof parsed.company_profile === 'object'
        ? parsed.company_profile as Record<string, unknown>
        : {};

    const companyProfile: CompanyProfileData = {
      company_name: normalizeText(rawProfile.company_name) || normalizeText(parsed.companyName) || agent.name,
      industry: hydrateFact(rawProfile.industry, pages as SourcePage[]),
      description: hydrateFact(rawProfile.description, pages as SourcePage[]),
      products: hydrateFactArray(rawProfile.products, pages as SourcePage[]),
      team: hydrateFactArray(rawProfile.team, pages as SourcePage[]),
      faqs: hydrateFaqArray(rawProfile.faqs, pages as SourcePage[]),
      contact: rawProfile.contact && typeof rawProfile.contact === 'object'
        ? {
            email: hydrateFact((rawProfile.contact as Record<string, unknown>).email, pages as SourcePage[]),
            phone: hydrateFact((rawProfile.contact as Record<string, unknown>).phone, pages as SourcePage[]),
            address: hydrateFact((rawProfile.contact as Record<string, unknown>).address, pages as SourcePage[]),
          }
        : null,
      generated_at: new Date().toISOString(),
    };

    return {
      companyName: normalizeText(parsed.companyName) || agent.name,
      industry: normalizeText(parsed.industry) || companyProfile.industry?.value || 'Unknown',
      description: normalizeText(parsed.description) || companyProfile.description?.value || '',
      keyProducts: Array.isArray(parsed.keyProducts)
        ? parsed.keyProducts.filter((entry): entry is string => typeof entry === 'string').slice(0, 8)
        : companyProfile.products?.map((entry) => entry.value).slice(0, 8) || [],
      keyTopics: Array.isArray(parsed.keyTopics)
        ? parsed.keyTopics.filter((entry): entry is string => typeof entry === 'string').slice(0, 8)
        : [],
      tone: ['formal', 'casual', 'technical', 'friendly'].includes(String(parsed.tone))
        ? parsed.tone as CompanyProfile['tone']
        : 'friendly',
      systemPrompt: normalizeText(parsed.systemPrompt),
      welcomeMessage: normalizeText(parsed.welcomeMessage),
      starterQuestions: Array.isArray(parsed.starterQuestions)
        ? parsed.starterQuestions.filter((entry): entry is string => typeof entry === 'string').slice(0, 4)
        : [],
      companyProfile:
        companyProfile.company_name || companyProfile.products?.length || companyProfile.faqs?.length
          ? companyProfile
          : buildFallbackCompanyProfile(agent.name, pages as SourcePage[], parsed),
    };
  } catch (error) {
    console.error('Company profiling failed:', error);
    return null;
  }
}

export function buildProfilePseudoChunks(profile: CompanyProfile): ProfilePseudoChunkInput[] {
  const pseudoChunks: ProfilePseudoChunkInput[] = [];
  if (profile.companyProfile.company_name) {
    pseudoChunks.push({
      pageId: profile.companyProfile.description?.source_page_id || null,
      headingPath: 'Extracted: Company',
      content: `Company name: ${profile.companyProfile.company_name}`,
      contextPrefix: `Structured company profile extracted from ${profile.companyProfile.description?.source_url || 'the company website'}.`,
    });
  }

  const pushFact = (headingPath: string, label: string, fact?: CompanyProfileFact | null) => {
    if (!fact?.value) return;
    pseudoChunks.push({
      pageId: fact.source_page_id || null,
      headingPath,
      content: `${label}: ${fact.value}`,
      contextPrefix: `Structured company profile extracted from ${fact.source_url || 'the company website'}.`,
    });
  };

  pushFact('Extracted: Company', 'Company', profile.companyProfile.description);
  pushFact('Extracted: Industry', 'Industry', profile.companyProfile.industry);

  for (const product of profile.companyProfile.products || []) {
    pushFact('Extracted: Products', 'Product', product);
  }

  for (const teamMember of profile.companyProfile.team || []) {
    pushFact('Extracted: Team', 'Team', teamMember);
  }

  for (const faq of profile.companyProfile.faqs || []) {
    if (!faq.question || !faq.answer) continue;
    pseudoChunks.push({
      pageId: faq.source_page_id || null,
      headingPath: 'Extracted: FAQ',
      content: `FAQ: ${faq.question}\nAnswer: ${faq.answer}`,
      contextPrefix: `Structured company profile extracted from ${faq.source_url || 'the company website'}.`,
    });
  }

  pushFact('Extracted: Contact', 'Email', profile.companyProfile.contact?.email);
  pushFact('Extracted: Contact', 'Phone', profile.companyProfile.contact?.phone);
  pushFact('Extracted: Contact', 'Address', profile.companyProfile.contact?.address);

  return pseudoChunks;
}

export async function applyCompanyProfile(agentId: string, profile: CompanyProfile): Promise<void> {
  const supabase = createServiceClient();

  const { data: agent } = await supabase
    .from('agents')
    .select('name')
    .eq('id', agentId)
    .single();

  if (agent) {
    const isAutoName = agent.name.includes('.') || agent.name.startsWith('Agent ');
    if (isAutoName && profile.companyName) {
      await supabase
        .from('agents')
        .update({ name: profile.companyName, description: profile.description })
        .eq('id', agentId);
    }
  }

  await supabase
    .from('agent_settings')
    .update({
      system_prompt: profile.systemPrompt || null,
      welcome_message: profile.welcomeMessage || null,
      starter_questions: profile.starterQuestions,
      company_profile: profile.companyProfile,
    })
    .eq('agent_id', agentId);
}
