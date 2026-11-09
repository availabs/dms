// The client judge (utils/authJudge.js) is a COPY of dms-server's routes/auth/{grants,vocabulary,judge}.js.
// This keeps every shared function identical, body for body: change the server, then paste the change
// here. Reads the server files as text only (test-time); the package never imports dms-server.
import { readFileSync } from 'fs';
import { createRequire } from 'module';
import { describe, expect, test } from 'vitest';

const require = createRequire(import.meta.url);
const SERVER = '../../../dms-server/src/routes/auth/';
const read = (f) => readFileSync(require.resolve(f), 'utf8');
const client = read('./authJudge.js');
const server = {
  grants: read(SERVER + 'grants.js'),
  vocabulary: read(SERVER + 'vocabulary.js'),
  judge: read(SERVER + 'judge.js'),
};

// `function NAME(` … brace-matched; `const NAME = ` … up to the first `;` at depth 0.
function definition(src, name) {
  let i = src.search(new RegExp(`^(function ${name}\\(|const ${name}\\s*=)`, 'm'));
  if (i < 0) return null;
  let depth = 0, j = i;
  for (; j < src.length; j++) {
    const ch = src[j];
    if (ch === '(' || ch === '{' || ch === '[') depth++;
    else if (ch === ')' || ch === '}' || ch === ']') { depth--; if (depth === 0 && src.startsWith('function', i) && ch === '}') { j++; break; } }
    else if (ch === ';' && depth === 0 && !src.startsWith('function', i)) { j++; break; }
  }
  return src.slice(i, j).replace(/\s+/g, ' ').trim();
}

const SHARED = {
  grants: ['parseJson', 'asList', 'resolveAuthPermissions', 'scopeOf', 'hasGrants', 'holds', 'isAppAdmin', 'mergeAuthPermissions'],
  vocabulary: ['SCOPES', 'fieldMaps', 'verbsForFields'],
  judge: ['allow', 'deny', 'list', 'STRUCTURAL', 'one', 'req', 'key', 'satisfied', 'blankSwap', 'editRequirements', 'judge'],
};

describe('the client judge is the server judge', () => {
  for (const [file, names] of Object.entries(SHARED)) {
    for (const name of names) {
      test(`${name} (${file}.js)`, () => {
        const theirs = definition(server[file], name);
        const ours = definition(client, name);
        expect(theirs, `${name} not found in the server's ${file}.js`).toBeTruthy();
        expect(ours, `${name} not found in utils/authJudge.js`).toBeTruthy();
        expect(ours).toBe(theirs);
      });
    }
  }
});
