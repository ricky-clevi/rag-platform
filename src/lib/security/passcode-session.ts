import { createHmac, timingSafeEqual } from 'crypto';

const SESSION_TTL_SECONDS = 60 * 60 * 12; // 12 hours

interface PasscodeSessionPayload {
  agentId: string;
  exp: number;
}

function base64UrlEncode(input: string): string {
  return Buffer.from(input, 'utf8').toString('base64url');
}

function base64UrlDecode(input: string): string {
  return Buffer.from(input, 'base64url').toString('utf8');
}

function getSecret(): string {
  const secret =
    process.env.PASSCODE_SESSION_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!secret) {
    throw new Error('Missing PASSCODE_SESSION_SECRET or SUPABASE_SERVICE_ROLE_KEY');
  }

  return secret;
}

function signPayload(encodedPayload: string): string {
  return createHmac('sha256', getSecret())
    .update(encodedPayload)
    .digest('base64url');
}

export function getPasscodeSessionCookieName(agentId: string): string {
  return `af_passcode_${agentId}`;
}

export function createPasscodeSessionToken(
  agentId: string,
  ttlSeconds: number = SESSION_TTL_SECONDS
): string {
  const payload: PasscodeSessionPayload = {
    agentId,
    exp: Math.floor(Date.now() / 1000) + ttlSeconds,
  };

  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const signature = signPayload(encodedPayload);

  return `${encodedPayload}.${signature}`;
}

export function verifyPasscodeSessionToken(
  token: string,
  agentId: string
): boolean {
  const [encodedPayload, signature] = token.split('.');
  if (!encodedPayload || !signature) return false;

  const expectedSignature = signPayload(encodedPayload);
  const expectedBuffer = Buffer.from(expectedSignature, 'utf8');
  const actualBuffer = Buffer.from(signature, 'utf8');

  if (
    expectedBuffer.length !== actualBuffer.length ||
    !timingSafeEqual(expectedBuffer, actualBuffer)
  ) {
    return false;
  }

  try {
    const payload = JSON.parse(base64UrlDecode(encodedPayload)) as PasscodeSessionPayload;
    if (payload.agentId !== agentId) return false;
    if (payload.exp <= Math.floor(Date.now() / 1000)) return false;
    return true;
  } catch {
    return false;
  }
}

export function getPasscodeSessionTtlSeconds(): number {
  return SESSION_TTL_SECONDS;
}
