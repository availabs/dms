#!/usr/bin/env node
// mint-token.mjs — mint a DMS session token via POST {host}/login.
//
// Two output modes:
//   1. No --out: prints the raw JWT to stdout — for the CLI:
//        export DMS_AUTH_TOKEN=$(node src/dms/packages/dms/cli/bin/mint-token.mjs \
//          --host http://localhost:3001 --project npmrdsv5 \
//          --email availabs@gmail.com --password test123)
//   2. --out + --origin: writes a Playwright storageState JSON seeding the app's
//      `userToken` localStorage key for that origin — for screenshot/diag scripts:
//        node src/dms/packages/dms/cli/bin/mint-token.mjs \
//          --host http://localhost:3001 --project npmrdsv5 \
//          --email availabs@gmail.com --password test123 \
//          --origin http://npmrds.localhost:5173 \
//          --out scratchpad/npmrdsv5-dev2/auth.json
//
// The --origin must match the URL you'll load (multi-tenant sites key auth per
// origin). Tokens expire ~6h — re-mint when scripts land on /auth/login.
// Flags fall back to env: DMS_HOST, DMS_APP (project), DMS_EMAIL, DMS_PASSWORD.
// See ../../../../skills/authenticating-the-dms-cli.md.
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

const argv = process.argv.slice(2);
const opt = (name, def) => { const i = argv.indexOf(`--${name}`); return i >= 0 && argv[i + 1] ? argv[i + 1] : def; };
const host = opt("host", process.env.DMS_HOST);
const project = opt("project", process.env.DMS_APP);
const email = opt("email", process.env.DMS_EMAIL);
const password = opt("password", process.env.DMS_PASSWORD);
const origin = opt("origin");
const out = opt("out");

if (!host || !project || !email || !password) {
  console.error("usage: mint-token.mjs --host <api-host> --project <app> --email <e> --password <p> [--origin <url> --out <storageState.json>]");
  process.exit(1);
}

const res = await fetch(`${host}/login`, {
  method: "POST",
  headers: { "Content-type": "application/json", Accept: "application/json" },
  body: JSON.stringify({ email, password, project }),
});
if (!res.ok) { console.error(`login failed: HTTP ${res.status}`); process.exit(1); }
const token = (await res.json())?.user?.token;
if (!token) { console.error("login failed: no user.token in response"); process.exit(1); }

if (out) {
  if (!origin) { console.error("--out requires --origin (the URL the browser will load)"); process.exit(1); }
  const storageState = { cookies: [], origins: [{ origin, localStorage: [{ name: "userToken", value: token }] }] };
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, JSON.stringify(storageState, null, 1));
  console.error(`token ok (${token.length} chars) → ${out} for ${origin}`);
} else {
  process.stdout.write(token);
  console.error(`\ntoken ok (${token.length} chars)`);
}
