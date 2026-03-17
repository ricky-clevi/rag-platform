const EXACT_ORIGIN_REGEX = /^https?:\/\/[a-z0-9._-]+(?::[0-9]+)?$/;
const WILDCARD_ORIGIN_REGEX = /^https?:\/\/\*\.[a-z0-9._-]+(?::[0-9]+)?$/;

function canonicalizeWildcardOrigin(raw: string): string | null {
  const lowered = raw.trim().toLowerCase();
  if (!lowered) return null;

  if (/[?#]/.test(lowered)) {
    return null;
  }

  const pathStart = lowered.indexOf('/', lowered.indexOf('://') + 3);
  const withoutPath =
    pathStart === -1 ? lowered : lowered.slice(0, pathStart);
  const trailingPath = pathStart === -1 ? '' : lowered.slice(pathStart);

  if (trailingPath && !/^\/+$/.test(trailingPath)) {
    return null;
  }

  const canonical = withoutPath.replace(/\/+$/, '');
  return WILDCARD_ORIGIN_REGEX.test(canonical) ? canonical : null;
}

export function canonicalizeOrigin(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  const wildcardOrigin = canonicalizeWildcardOrigin(trimmed);
  if (wildcardOrigin) {
    return wildcardOrigin;
  }

  try {
    const url = new URL(trimmed);
    const scheme = url.protocol.toLowerCase();
    if (scheme !== 'http:' && scheme !== 'https:') return null;

    if ((url.pathname && !/^\/+$/.test(url.pathname)) || url.search || url.hash) {
      return null;
    }

    const canonical = `${scheme.slice(0, -1)}://${url.hostname.toLowerCase()}${
      url.port ? `:${url.port}` : ''
    }`;

    return EXACT_ORIGIN_REGEX.test(canonical) ? canonical : null;
  } catch {
    return null;
  }
}

export function validateOrigin(
  origin: string,
  allowedOrigins: string[],
  options: { allowEmptyList?: boolean } = {}
): boolean {
  if (allowedOrigins.length === 0) {
    return options.allowEmptyList === true;
  }

  const canonicalOrigin = canonicalizeOrigin(origin);
  if (!canonicalOrigin) return false;

  for (const allowed of allowedOrigins) {
    const canonicalAllowed = canonicalizeOrigin(allowed);
    if (!canonicalAllowed) continue;

    if (canonicalOrigin === canonicalAllowed) {
      return true;
    }

    if (
      canonicalAllowed.startsWith('https://*.') ||
      canonicalAllowed.startsWith('http://*.')
    ) {
      const schemeEnd = canonicalAllowed.indexOf('://');
      const allowedScheme = canonicalAllowed.slice(0, schemeEnd);
      const wildcardSuffix = canonicalAllowed.slice(schemeEnd + 5);
      const originSchemeEnd = canonicalOrigin.indexOf('://');
      const originScheme = canonicalOrigin.slice(0, originSchemeEnd);
      const originHost = canonicalOrigin.slice(originSchemeEnd + 3);

      if (originScheme !== allowedScheme) continue;
      if (
        originHost.endsWith(`.${wildcardSuffix}`) &&
        originHost !== wildcardSuffix
      ) {
        return true;
      }
    }
  }

  return false;
}
