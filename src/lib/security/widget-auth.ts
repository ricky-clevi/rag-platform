import { createHmac, randomBytes, timingSafeEqual } from 'crypto';

const SESSION_TTL_SECONDS = 60 * 60 * 24; // 24 hours
const REFRESH_GRACE_PERIOD_SECONDS = 60 * 60; // 1 hour

export interface WidgetSessionPayload {
  agentId: string;
  apiKeyId: string;
  origin: string | null;
  jti: string;
  iat: number;
  exp: number;
}

function base64UrlEncode(input: string): string {
  return Buffer.from(input, 'utf8').toString('base64url');
}

function base64UrlDecode(input: string): string {
  return Buffer.from(input, 'base64url').toString('utf8');
}

function getWidgetSecret(): string {
  const secret = process.env.WIDGET_SESSION_SECRET;

  if (!secret) {
    throw new Error('WIDGET_SESSION_SECRET environment variable is required');
  }

  return secret;
}

function signPayload(encodedPayload: string): string {
  return createHmac('sha256', getWidgetSecret())
    .update(encodedPayload)
    .digest('base64url');
}

export function generatePublicKey(): string {
  return `pk_${randomBytes(32).toString('hex')}`;
}

export function createWidgetSessionToken(
  agentId: string,
  apiKeyId: string,
  origin: string | null,
  sessionJti: string
): string {
  const nowSeconds = Math.floor(Date.now() / 1000);

  const payload: WidgetSessionPayload = {
    agentId,
    apiKeyId,
    origin,
    jti: sessionJti,
    iat: nowSeconds,
    exp: nowSeconds + SESSION_TTL_SECONDS,
  };

  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const signature = signPayload(encodedPayload);

  return `${encodedPayload}.${signature}`;
}

export function verifyWidgetSessionToken(
  token: string
): { valid: true; payload: WidgetSessionPayload } | { valid: false } {
  const [encodedPayload, signature] = token.split('.');
  if (!encodedPayload || !signature) return { valid: false };

  const expectedSignature = signPayload(encodedPayload);
  const expectedBuffer = Buffer.from(expectedSignature, 'utf8');
  const actualBuffer = Buffer.from(signature, 'utf8');

  if (
    expectedBuffer.length !== actualBuffer.length ||
    !timingSafeEqual(expectedBuffer, actualBuffer)
  ) {
    return { valid: false };
  }

  try {
    const payload = JSON.parse(base64UrlDecode(encodedPayload)) as WidgetSessionPayload;
    if (payload.exp <= Math.floor(Date.now() / 1000)) return { valid: false };
    return { valid: true, payload };
  } catch {
    return { valid: false };
  }
}

export function refreshWidgetSessionToken(
  oldToken: string
): { token: string; payload: WidgetSessionPayload } | null {
  const [encodedPayload, signature] = oldToken.split('.');
  if (!encodedPayload || !signature) return null;

  const expectedSignature = signPayload(encodedPayload);
  const expectedBuffer = Buffer.from(expectedSignature, 'utf8');
  const actualBuffer = Buffer.from(signature, 'utf8');

  if (
    expectedBuffer.length !== actualBuffer.length ||
    !timingSafeEqual(expectedBuffer, actualBuffer)
  ) {
    return null;
  }

  let oldPayload: WidgetSessionPayload;
  try {
    oldPayload = JSON.parse(base64UrlDecode(encodedPayload)) as WidgetSessionPayload;
  } catch {
    return null;
  }

  const nowSeconds = Math.floor(Date.now() / 1000);

  // Allow if not expired, or expired within the grace period
  if (oldPayload.exp + REFRESH_GRACE_PERIOD_SECONDS <= nowSeconds) {
    return null;
  }

  const newPayload: WidgetSessionPayload = {
    agentId: oldPayload.agentId,
    apiKeyId: oldPayload.apiKeyId,
    origin: oldPayload.origin,
    jti: oldPayload.jti,
    iat: nowSeconds,
    exp: nowSeconds + SESSION_TTL_SECONDS,
  };

  const newEncodedPayload = base64UrlEncode(JSON.stringify(newPayload));
  const newSignature = signPayload(newEncodedPayload);
  const token = `${newEncodedPayload}.${newSignature}`;

  return { token, payload: newPayload };
}
