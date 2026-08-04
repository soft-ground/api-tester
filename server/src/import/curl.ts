// Parse a curl command string into an endpoint shape.

interface ParsedCurl {
  name: string;
  method: string;
  baseUrl: string;
  path: string;
  headers: { key: string; value: string; enabled: boolean }[];
  queryParams: { key: string; value: string; enabled: boolean }[];
  bodyType: string;
  bodyTemplate: string | null;
  authType: string;
  authConfig: Record<string, any>;
}

// Tokenize while respecting quotes.
function tokenize(input: string): string[] {
  const tokens: string[] = [];
  let i = 0;
  const s = input.replace(/\\\r?\n/g, ' ').trim();
  while (i < s.length) {
    while (i < s.length && /\s/.test(s[i])) i++;
    if (i >= s.length) break;
    let tok = '';
    const quote = s[i] === '"' || s[i] === "'" ? s[i] : '';
    if (quote) {
      i++;
      while (i < s.length && s[i] !== quote) {
        if (s[i] === '\\' && i + 1 < s.length) {
          tok += s[i + 1];
          i += 2;
        } else {
          tok += s[i++];
        }
      }
      i++; // closing quote
    } else {
      while (i < s.length && !/\s/.test(s[i])) tok += s[i++];
    }
    tokens.push(tok);
  }
  return tokens;
}

export function parseCurl(input: string): ParsedCurl {
  const tokens = tokenize(input.trim());
  let method = '';
  let url = '';
  const headers: { key: string; value: string; enabled: boolean }[] = [];
  let body: string | null = null;
  let authType = 'none';
  const authConfig: Record<string, any> = {};

  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (t === 'curl') continue;
    if (t === '-X' || t === '--request') {
      method = (tokens[++i] || 'GET').toUpperCase();
    } else if (t === '-H' || t === '--header') {
      const h = tokens[++i] || '';
      const idx = h.indexOf(':');
      if (idx > -1) {
        const key = h.slice(0, idx).trim();
        const value = h.slice(idx + 1).trim();
        // Promote the Authorization header to auth.
        if (key.toLowerCase() === 'authorization' && /^Bearer\s/i.test(value)) {
          authType = 'bearer';
          authConfig.token = value.replace(/^Bearer\s+/i, '');
        } else {
          headers.push({ key, value, enabled: true });
        }
      }
    } else if (
      t === '-d' ||
      t === '--data' ||
      t === '--data-raw' ||
      t === '--data-binary' ||
      t === '--data-ascii'
    ) {
      body = tokens[++i] ?? '';
    } else if (t === '-u' || t === '--user') {
      const cred = tokens[++i] || '';
      const ci = cred.indexOf(':');
      authType = 'basic';
      authConfig.username = ci > -1 ? cred.slice(0, ci) : cred;
      authConfig.password = ci > -1 ? cred.slice(ci + 1) : '';
    } else if (t === '--url') {
      url = tokens[++i] || '';
    } else if (t === '--compressed' || t.startsWith('-')) {
      // Ignored flags (-s, -k, -L, --location, etc.). Treated as valueless.
    } else if (!url && /^https?:\/\//i.test(t)) {
      url = t;
    } else if (!url && t) {
      url = t;
    }
  }

  if (!method) method = body != null ? 'POST' : 'GET';

  // Split the URL: baseUrl + path + query.
  let baseUrl = '';
  let path = '';
  const queryParams: { key: string; value: string; enabled: boolean }[] = [];
  try {
    const u = new URL(url);
    baseUrl = `${u.protocol}//${u.host}`;
    path = u.pathname;
    u.searchParams.forEach((value, key) =>
      queryParams.push({ key, value, enabled: true }),
    );
  } catch {
    // If URL parsing fails, put the whole string in path.
    path = url;
  }

  const bodyType = body != null ? 'json' : 'none';

  return {
    name: `${method} ${path || url}`,
    method,
    baseUrl,
    path,
    headers,
    queryParams,
    bodyType,
    bodyTemplate: body,
    authType,
    authConfig,
  };
}
