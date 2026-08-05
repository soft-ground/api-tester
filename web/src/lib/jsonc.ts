// Remove `//` line comments and `/* */` block comments from a JSONC string,
// while preserving comment-like sequences inside string literals (e.g. "http://x").
// Mirrors server/src/executor/jsonc.ts so the client and server agree on how a
// JSON body with annotations is reduced to strict JSON before it is sent.
export function stripJsonComments(input: string): string {
  let out = '';
  let inString = false;

  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    const next = i + 1 < input.length ? input[i + 1] : '';

    if (inString) {
      out += ch;
      if (ch === '\\') {
        if (i + 1 < input.length) {
          out += input[i + 1];
          i++;
        }
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }

    if (ch === '"') {
      inString = true;
      out += ch;
      continue;
    }

    if (ch === '/' && next === '/') {
      let j = i + 2;
      while (j < input.length && input[j] !== '\n') j++;
      i = j - 1;
      continue;
    }

    if (ch === '/' && next === '*') {
      let j = i + 2;
      while (j < input.length && !(input[j] === '*' && input[j + 1] === '/')) j++;
      i = j + 1;
      continue;
    }

    out += ch;
  }

  return out;
}
