// Regenerates hoverCompLegacy.golden.json from the CURRENT code.
//
// DELIBERATE ACT. Running this means you intend to change what every graph tooltip in every
// site looks like — ~7,415 legend-rendering graphs in MitigateNY alone hover through these
// components. Never run it to make a red test green; the goldens exist to catch exactly that.
//
//   npx vite-node packages/dms/tests/fixtures/capture-hoverCompLegacy.mjs
import { writeFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { CASES, render } from "./hoverCompCases.jsx";

const out = {};
for (const [name, testCase] of Object.entries(CASES)) out[name] = render(testCase);
const dest = path.join(path.dirname(fileURLToPath(import.meta.url)), "hoverCompLegacy.golden.json");
writeFileSync(dest, JSON.stringify(out, null, 2) + "\n");
console.log(`wrote ${ Object.keys(out).length } goldens to ${ dest }`);
