// Remove `//` line comments and `/* */` block comments from a JSONC string,
// while preserving comment-like sequences inside string literals (e.g. "http://x").
// Only comments are removed; all other content (including trailing commas) is left intact,
// so the caller still gets strict JSON as long as the non-comment parts were valid JSON.
//
// This lets users annotate a JSON request body with required/optional notes, e.g.:
//   {
//     "amount": "100",   // required
//     "memo": "note"     // optional
//   }
// The comments are stripped on the server before the request is sent to the target API.
export function stripJsonComments(input: string): string {
  let out = '';
  let inString = false;

  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    const next = i + 1 < input.length ? input[i + 1] : '';

    if (inString) {
      out += ch;
      if (ch === '\\') {
        // Keep the escaped character verbatim so an escaped quote does not end the string.
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
      // Line comment: skip to (but keep) the end-of-line.
      let j = i + 2;
      while (j < input.length && input[j] !== '\n') j++;
      i = j - 1; // the loop's i++ lands on '\n' (appended next) or past the end
      continue;
    }

    if (ch === '/' && next === '*') {
      // Block comment: skip to the closing */.
      let j = i + 2;
      while (j < input.length && !(input[j] === '*' && input[j + 1] === '/')) j++;
      i = j + 1; // the loop's i++ lands past the closing '/'
      continue;
    }

    out += ch;
  }

  return out;
}
