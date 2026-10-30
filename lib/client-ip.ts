export function getClientIp(
  headers:
    | Headers
    | { get(name: string): string | null }
    | Record<string, string | string[] | undefined>
    | undefined
    | null
): string {
  if (!headers) {
    return 'unknown';
  }

  const getHeader = (name: string): string | undefined => {
    if (typeof (headers as Headers).get === 'function') {
      return (headers as Headers).get(name) ?? undefined;
    }
    const record = headers as Record<string, string | string[] | undefined>;
    const direct = record[name] ?? record[name.toLowerCase()];
    if (Array.isArray(direct)) {
      return direct[0];
    }
    return direct;
  };

  // 1. Netlify client connection IP first (trusted edge IP, cannot be client-spoofed)
  const nfIp = getHeader('x-nf-client-connection-ip')?.trim();
  if (nfIp) {
    return nfIp;
  }

  // 2. LAST entry of x-forwarded-for (proxies append the verified client IP at the end)
  const forwarded = getHeader('x-forwarded-for');
  if (forwarded) {
    const parts = forwarded
      .split(',')
      .map((p) => p.trim())
      .filter(Boolean);
    const last = parts[parts.length - 1];
    if (last) {
      return last;
    }
  }

  // 3. x-real-ip
  const realIp = getHeader('x-real-ip')?.trim();
  if (realIp) {
    return realIp;
  }

  return 'unknown';
}
