import { GoogleGenAI } from '@google/genai';

let client: GoogleGenAI | null = null;

export function getGeminiClient(): GoogleGenAI {
  if (!client) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error('GEMINI_API_KEY environment variable is not set');
    }
    client = new GoogleGenAI({ apiKey });
  }
  return client;
}

export const EMBEDDING_MODEL = process.env.GEMINI_EMBEDDING_MODEL || 'gemini-embedding-001';
export const DEFAULT_CHAT_MODEL = process.env.GEMINI_DEFAULT_MODEL || 'gemini-3.1-flash-lite-preview';
export const ESCALATION_CHAT_MODEL = process.env.GEMINI_ESCALATION_MODEL || 'gemini-3.1-pro-preview';
export const EMBEDDING_DIMENSIONS = parseInt(process.env.GEMINI_EMBEDDING_DIMENSIONS || '768', 10);
export const ESCALATION_CONFIDENCE_THRESHOLD = parseFloat(process.env.GEMINI_ESCALATION_THRESHOLD || '0.4');
