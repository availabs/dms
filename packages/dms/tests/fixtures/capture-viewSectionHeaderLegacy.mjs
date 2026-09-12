// Regenerates viewSectionHeaderLegacy.golden.json from the CURRENT code.
//
// DELIBERATE ACT. Running this means you intend to change what every existing site's section
// header looks like — 154,632 MitigateNY component rows render through that component. Never
// run it to make a red test green; the goldens exist to catch exactly that.
//
//   npx vite-node packages/dms/tests/fixtures/capture-viewSectionHeaderLegacy.mjs
import { writeFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { CASES, render } from "./viewSectionHeaderCases.jsx";

const out = {};
for (const [name, props] of Object.entries(CASES)) out[name] = render(props);
const dest = path.join(path.dirname(fileURLToPath(import.meta.url)), "viewSectionHeaderLegacy.golden.json");
writeFileSync(dest, JSON.stringify(out, null, 2) + "\n");
console.log(`wrote ${ Object.keys(out).length } goldens to ${ dest }`);
