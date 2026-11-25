# R4 — Plugin security and dev-ops (research)

*Research item R4 (security and dev-ops) for the DMS plugin system. Compiled 2026-11-22. Sources are inline. Items marked **[unverified]** could not be confirmed against a primary source in this pass. Version and date facts were checked on 2026-11-22 unless noted.*

## TL;DR

1. **Node.js has no in-process security boundary you can rely on.** The Node docs say outright that the permission model "does not provide security guarantees in the presence of malicious code" and that `node:vm` "is not a security mechanism". isolated-vm is in maintenance mode and can't run npm packages. So **in-process plugins are trusted code**, whatever tooling surrounds them.
2. **The real boundaries are the OS process / container (plus a scoped DB role) and WASM.** Untrusted server code belongs in a separate process or container that holds only the capabilities you hand it over RPC. This is the Grafana (go-plugin), Cloudflare (isolate + namespaces + seccomp) and Atlassian Forge pattern.
3. **In the browser, same-origin plugin JS can do anything the user can.** The cookie can be HttpOnly, but the plugin can still make authenticated requests. Real isolation means a sandboxed cross-origin iframe or a worker plus remote-DOM (Figma, Shopify, Forge). Either one gives up SSR and direct React integration for that plugin.
4. **Split "install" from "activate."** Activation per tenant is a data change checked per request, so it needs no restart. Installing new *server* code is best done with a **health-checked rolling restart of the host or plugin process**, not ESM hot reload. The ESM cache can't evict modules, and query-string cache busting leaks memory. *Client* code needs no restart: it is versioned static files plus a manifest.
5. **Supply chain:** pin by digest, verify signatures and attestations (Sigstore / GitHub immutable releases + `gh release verify`), vendor-bundle dependencies at build time, never run install scripts on the host, and keep a signed index (TUF-style) for the registry. The 2025 chalk/debug hijack and both Shai-Hulud worm waves are the reasons.

---

## 1. Isolating server-side plugin code in Node.js

### 1.1 Options compared

| Option | Boundary strength | Perf / overhead | npm & native deps | Debugging | Memory | Verdict for DMS |
|---|---|---|---|---|---|---|
| In-process `import()` | **None.** Plugin shares the heap, `process.env`, DB pools and the DAMA credentials | Zero | Full | Best | Shared | First-party only |
| Node **permission model** (`--permission`, `--allow-fs-read/-write`, `--allow-net`, `--allow-child-process`, `--allow-worker`, `--allow-addons`, `--allow-wasi`) | **Not a security boundary** (Node docs). Process-wide, not per-plugin | ~0 | Full | Normal | — | A seat belt for a plugin *process*, not a boundary |
| `node:vm` | **None** ("not a security mechanism") | Low | Partial | OK | Shared | Don't use for isolation |
| **isolated-vm** (separate V8 isolate) | Real V8 isolate boundary, but host-API leaks are easy. Maintenance mode | Low–med (copy across the boundary) | **No** npm, no Node APIs. Pure JS only | Weak | Per-isolate heap cap | Small "script" extensions only (the Directus pattern) |
| **SES / Endo / LavaMoat** compartments | Object-capability isolation inside one realm. Strong against *capability* abuse, but no CPU/memory limits and same-process DoS is possible | Low (lockdown cost at start) | Most pure-JS packages. Policy per package | OK | Shared | Good extra layer for least-authority dependencies. Not alone for hostile code |
| **worker_threads** | **None** for security (same process). `resourceLimits` for heap only | Low | Full | OK | Separate heap | Crash/CPU separation for trusted code |
| **Child process per plugin** + RPC (go-plugin, VS Code extension host) | OS process boundary. As strong as the uid / namespaces / seccomp / permission flags you add | Med: ~30–60 MB RSS per Node process **[typical, unverified]**, IPC latency | Full, including native and GDAL | Good (`--inspect` per process) | Isolated, OS-limited | **Default for anything not first-party** |
| **Container per plugin** (Docker, + gVisor / Firecracker) | Strong (namespaces, cgroups, seccomp). gVisor/Firecracker add a kernel boundary | Higher (start time, image size) | Full | Good | cgroup-limited | Untrusted third-party server code; workers that shell out to GDAL |
| **WASM** (Extism, Javy/QuickJS-in-WASM, Wasmtime component model) | Strong memory-safe sandbox, deny-by-default host functions | QuickJS interp is slower than V8 JIT. Fine for logic | **No** Node APIs, no native. npm only if pure and bundled | Weak–improving | Linear memory cap | Untrusted *logic* hooks (transforms, validators). Not data-type ETL |
| **Deno subprocess** with permission flags | Deno's permissions are the runtime's design point. Deny-by-default, `--deny-*` overrides | Separate runtime to ship and patch | npm via `npm:` specifiers. Native/FFI only with `--allow-ffi` | Good | Process | Viable middle ground. Second runtime to maintain |
| **ShadowRealm** | Integrity separation (fresh globals), not a security sandbox | — | — | — | — | Not usable: TC39 **Stage 2.7**, not shipping |

Primary sources and key quotes:

- **Permission model**: Node docs, [nodejs.org/api/permissions.html](https://nodejs.org/api/permissions.html). Stable since **v23.5.0 / v22.13.0**. The docs say: "This feature does not protect against malicious code… Node.js trusts any code it is asked to run," and it is a "seat belt" approach. Known holes: symlinks are followed out of granted paths, existing file descriptors bypass the model, worker `execArgv` replaces inherited flags, and `process._debugProcess()` is ungated. It also keeps receiving bypass CVEs: [CVE-2025-55130](https://nvd.nist.gov/vuln/detail/CVE-2025-55130) (symlink escape, fixed v20.20.0 / v22.22.0 / v24.13.0 / v25.3.0) and [CVE-2026-21715](https://www.tenable.com/cve/CVE-2026-21715) (realpath.native). Red Hat lists further 2026 bypasses, e.g. [CVE-2026-48617](https://access.redhat.com/security/cve/CVE-2026-48617) (process.report) **[vendor pages, not yet checked against the Node advisory]**. Conclusion: use it as defence in depth *inside a plugin process* (e.g. `--permission --allow-fs-read=/plugins/x --allow-net`), never as the wall.
- **vm**: [nodejs.org/api/vm.html](https://nodejs.org/api/vm.html): "**The `node:vm` module is not a security mechanism. Do not use it to run untrusted code.**" (vm2, the library built on it, was abandoned in 2023 after repeated escapes. Directus replaced it with isolated-vm after an escape: [GitLab advisory GMS-2023-2358](https://advisories.gitlab.com/pkg/npm/directus/GMS-2023-2358/).)
- **isolated-vm**: [github.com/laverdet/isolated-vm](https://github.com/laverdet/isolated-vm). "currently in *maintenance mode*". Version 7.x for Node 26, 6.x/5.x for Node 24, 5.x/4.x for Node 22. Needs `--no-node-snapshot` on Node ≥20. The README warns that leaking `Reference`/`ExternalCopy` objects gives "a springboard back into the nodejs isolate". It recommends running isolated-vm "in a separate Node process from other critical infrastructure" and says untrusted code can still crash or hang the process. Real-world use: [Directus sandboxed extensions](https://directus.io/docs/guides/extensions/api-extensions/sandbox) expose a `directus:api` module whose every call is checked against `requestedScopes` declared in `package.json`. By default there is no DB, network or filesystem access, and no third-party imports or even `setTimeout`. That is the ceiling of this approach.
- **SES / LavaMoat**: [LavaMoat](https://github.com/lavamoat/lavamoat) runs each package in an SES Compartment after `lockdown()`, with an auto-generated, human-reviewed `policy.json` (globals and builtins per package) plus `policy-override.json`. `@lavamoat/allow-scripts` blocks install scripts by default. Node 24 was added to supported engines in 9.0.10 (2025-06). SES makes capabilities explicit. It does not cap memory or CPU, and it depends on the integrity of every endowment you pass in.
- **ShadowRealm**: [tc39/proposal-shadowrealm](https://github.com/tc39/proposal-shadowrealm): "Currently at Stage 2.7". Not in Node or browsers by default.
- **Process isolation in practice**: Grafana backend plugins: "The Grafana server launches each plugin backend as a subprocess and communicates with it over gRPC" (HashiCorp go-plugin, automatic mTLS). [grafana.com/developers/plugin-tools/key-concepts/backend-plugins/plugin-protocol](https://grafana.com/developers/plugin-tools/key-concepts/backend-plugins/plugin-protocol). VS Code's extension host is a separate process for *stability*, not security: "The extension host has the same permissions as VS Code itself" ([code.visualstudio.com/docs/configure/extensions/extension-runtime-security](https://code.visualstudio.com/docs/configure/extensions/extension-runtime-security)). A separate process only becomes a security boundary once you also drop privileges.
- **Defence in depth at scale**: Cloudflare Workers pair V8 isolates with a per-process Linux namespace + seccomp sandbox. They schedule free and enterprise customers in different processes, and (2025) use memory protection keys between isolates. They assume V8 zero-days happen ([security model](https://developers.cloudflare.com/workers/reference/security-model/), [Safe in the sandbox, 2025-09-25](https://blog.cloudflare.com/safe-in-the-sandbox-security-hardening-for-cloudflare-workers/)). Lesson: one isolate layer is not enough for hostile code.
- **WASM**: The Extism JS PDK is a Javy (QuickJS + Wizer) fork that compiles JS to a `.wasm` plugin run by the host SDK. Host functions are the only capabilities. Limits include at most 5 arguments per host function ([extism/js-pdk](https://github.com/extism/js-pdk)). The component model now has **WASI 0.3 (released 2026-06-11)** with native async. Wasmtime 46+ enables it by default, and jco's Node support for 0.3 is still a shim ([wasi.dev/releases/wasi-p3](https://wasi.dev/releases/wasi-p3), [Bytecode Alliance](https://bytecodealliance.org/articles/WASI-0.3)). This is a good fit for small pure functions such as calculated columns, row validators or transforms. It does not fit Express routes that use npm, Postgres drivers or GDAL.
- **Deno**: Deno is deny-by-default with `--allow-read/-write/-net/-env/-run/-sys/-ffi/-import`. Deny flags take precedence (`--allow-net --deny-net=…`). The docs warn that `--allow-run` plus `--allow-write` is effectively full access ([docs.deno.com/runtime/fundamentals/security](https://docs.deno.com/runtime/fundamentals/security)).
- **Containers**: gVisor (user-space kernel) and Firecracker (microVM) are the standard "untrusted code in containers" upgrades. **[Not re-fetched in this pass. Well-established; check versions before adoption.]**

### 1.2 Capabilities instead of ambient authority

Whatever the runtime, the plugin should **start with nothing** and receive capabilities from the host:

- **Host SDK over RPC.** A versioned `@dms/plugin-sdk` exposes `ctx.db`, `ctx.falcor`, `ctx.storage`, `ctx.fetch`, `ctx.secrets`, `ctx.logger`, `ctx.queue.enqueue`, `ctx.tenant`. In-process (first-party), these are plain objects. Out-of-process, the same interface is backed by JSON-RPC / gRPC over a Unix socket or stdio, so the plugin author's code doesn't change when the trust tier changes. Directus (`directus:api`), Grafana (Go SDK over gRPC) and Atlassian Forge (manifest `permissions` + `@forge/api`) all follow this shape.
- **Manifest-declared scopes, granted per tenant.** For example `db:own-schema`, `db:read:dama:<view>`, `net:https://api.example.com`, `queue:worker`, `secrets:<name>`. Activation shows the tenant admin what is being granted, as Forge does for egress. Forge requires egress domains in the manifest and forbids wildcards for its trust programme ([Forge runtime egress](https://developer.atlassian.com/platform/forge/runtime-egress-permissions/), [AGC requirements](https://developer.atlassian.com/platform/framework/agc/agc-security-requirements/)).
- **Scoped Postgres access** ([SET ROLE docs, current](https://www.postgresql.org/docs/current/sql-set-role.html)):
  - **Give each plugin its own LOGIN role and its own pool.** `SET ROLE` on a shared pool is **not** a boundary if the plugin can send arbitrary SQL. The docs say `RESET ROLE` / `SET ROLE NONE` "can be executed by any user". So `SET ROLE` works only when the *host* builds the SQL.
  - Grant the role `USAGE`/`CREATE` on its own schema only, plus `SELECT` on specific DAMA views through `GRANT` or through `SECURITY DEFINER` functions the host owns. Note that `SET ROLE` can't be used inside them.
  - Use role-level limits: `ALTER ROLE p_x SET statement_timeout = '30s'`, `idle_in_transaction_session_timeout`, `CONNECTION LIMIT n`, `work_mem`. **Caution:** a role can override its own `statement_timeout` with `SET`. Enforce hard caps at the pool or proxy level, and with `pg_cancel_backend` from a supervisor.
  - **RLS for multi-tenant plugin tables**: key policies on something the plugin can't forge. A GUC like `current_setting('app.tenant')` can be reset by the plugin if it has raw SQL. Untrusted plugins should therefore get either a per-tenant role, or no raw SQL at all (host-mediated query API only).
  - **Never hand DAMA superuser or owner credentials to a plugin process.** DAMA access goes through the host API or a narrowly granted read role.
- **Outbound network allow-list.** In-process you can't enforce one. For a plugin process or container, use an egress proxy (an HTTP CONNECT allow-list) or a container network policy. Node's `--allow-net` is all-or-nothing, so it isn't a per-host allow-list.
- **Secrets.** Store them per plugin per tenant, encrypted, and inject them at call time through `ctx.secrets.get()` rather than environment variables. Environment variables leak to child processes, crash reports and `/proc`. Never pass the host's `.env` to a plugin process (spawn with `env: {}`).
- **Quotas.** Cap CPU and memory with cgroups (`docker --cpus --memory`, or systemd `MemoryMax=` / `CPUQuota=`). Set `--max-old-space-size` on plugin processes. Use per-plugin queue concurrency, rate-limit RPC calls, and cap disk with a per-plugin volume or quota.

**DMS-specific note.** Data-type plugins run task-queue jobs that shell out to `ogr2ogr`. That rules out isolated-vm, WASM and SES as their *only* runtime, because they need a real process. The natural boundary is "plugin worker = its own process or container, running as its own uid, holding a plugin-scoped DB role, with a scratch directory." That is roughly how the task queue already isolates jobs.

---

## 2. Isolating client-side plugin code

**Fact:** a script running on the DMS origin can do anything the user can. An **HttpOnly session cookie** stops the script from *reading* the cookie. It does not stop the script from making `fetch('/graph', {credentials:'include'})` calls *as the user*, reading anything rendered in the DOM, or rewriting the UI to phish. Same-origin plugin code therefore has to be trusted (signed and reviewed). The alternatives:

| Approach | What it protects | Cost | Who uses it |
|---|---|---|---|
| Trusted same-origin code (signed, reviewed, CSP-pinned) | Nothing at runtime. Integrity via signature and SRI | Free. Full React/SSR integration | Backstage dynamic plugins, Grafana frontend plugins (signed) |
| **Sandboxed cross-origin iframe** (`sandbox="allow-scripts"`, no `allow-same-origin`, separate origin) + `postMessage` RPC | Session, DOM and storage of the host | Async API. Data copying. Layout and resize plumbing. No SSR of the plugin's content | Figma plugin UI, Atlassian Forge Custom UI (platform-set sandbox and CSP), Shopify admin apps |
| **Web Worker / hidden iframe + remote-dom** | Host DOM and session. The plugin describes UI, the host renders vetted components | Plugins limited to the host's component set. Async | Shopify checkout UI extensions ([remote-dom](https://github.com/Shopify/remote-dom), [Shopify engineering](https://shopify.engineering/remote-rendering-ui-extensibility)): sandbox script from a separate domain, no `window`, 64 KB bundle cap |
| **SES in the browser** (Realms-style) | Global and capability separation in the main thread | Shim bugs are escapes. Figma's Realms-shim escape (2019) pushed them to a **QuickJS-in-WASM** VM ([Figma blog, 2019-08-22](https://www.figma.com/blog/how-we-built-the-figma-plugin-system/)) | Figma (historically), MetaMask Snaps |
| **CSP** (`script-src` with nonces or hashes / `'strict-dynamic'`, `connect-src` allow-list) | Limits where code loads from and talks to. Stops unknown-origin injection | Configuration per site | Everyone |
| **Trusted Types** (`require-trusted-types-for 'script'`) | DOM-XSS sinks | Some libraries need policies. **Baseline since Feb 2026**: Chrome, Safari 26, Firefox 148 ([MDN](https://developer.mozilla.org/en-US/docs/Web/API/trustedTypes), [Mozilla intent](https://groups.google.com/a/mozilla.org/g/dev-platform/c/WA8vLAbvzB0)) | Google properties |
| **SRI** (`integrity=` on `<script>`/`<link>`, and the `integrity` map in import maps) | Plugin bundle tampering on the CDN or server | Hash per file in the manifest | Common for CDN assets |

**Interaction with SSR.** An iframe or remote-dom plugin can't render inside the host's SSR pass. The host renders a placeholder (or a server-side "preview" produced by the plugin's *sandboxed* server runtime as plain HTML/JSON) and hydrates the frame client-side. Only **trusted** plugins can contribute React components that render in Node SSR and in RSC. A Server Component *is* server code, so an RSC plugin is a server plugin with server trust. Practical rule for DMS: **themes and pattern components that render in SSR or RSC are trusted tier**. Untrusted UI goes in an iframe or remote-dom slot.

**Auth tokens.** Keep the session HttpOnly + `SameSite=Lax/Strict`. For iframe plugins, mint a **short-lived, audience-scoped token** per plugin per tenant, carrying only the plugin's granted scopes. Send it via `postMessage`, and have plugin API calls go to a plugin-scoped endpoint that enforces those scopes, as Forge does with its bridge. Never expose the session cookie's authority to the frame.

---

## 3. Loading separately-built client code at runtime (Vite 8 / Rolldown / React 19)

**Status (Nov 2026):**

- **Vite 8 stable shipped 2026-03-12** on Rolldown and lists Module Federation among the capabilities a unified bundler enables ([vite.dev/blog/announcing-vite8](https://vite.dev/blog/announcing-vite8)).
- **Module Federation 2.0 is stable** (InfoQ, 2026-04-03) across webpack, Rspack, Rollup, **Rolldown**, Vite and Metro. It adds an `mf-manifest.json` protocol, a bundler-independent runtime, runtime version negotiation, and "first-class Node.js runtime support" for SSR consumers ([InfoQ](https://www.infoq.com/news/2026/04/module-federation-2-stable)).
- **`@module-federation/vite`** declares Vite ^5–^8 peers and handles Vite 8's `codeSplitting.groups` ([repo](https://github.com/module-federation/vite)).
- **Rolldown's native MF plugin**: I found no current official Rolldown docs page for it. Treat it as experimental **[unverified]**, and prefer `@module-federation/vite` + the MF runtime.
- **Backstage** builds dynamic frontend plugins as MF remotes (`yarn build --module-federation`) served by `backend-dynamic-feature-service` ([backstage.io MF docs](https://backstage.io/docs/frontend-system/building-apps/module-federation)). This is the closest analogue to DMS.

**Three loading strategies:**

1. **Module Federation 2.0.** The host declares `shared: { react, 'react-dom', 'react-router', '@availabs/dms-sdk' }` as `singleton: true` with `requiredVersion` ranges. Plugins are remotes listed in a per-tenant manifest. Pros: version negotiation, shared-scope fallback, Node runtime for SSR, a mature ecosystem. Cons: runtime complexity, bundler coupling, debugging chunk graphs.
2. **Plain ESM + import map** (lowest magic). Plugins are built in Vite library mode with `react`, `react/jsx-runtime`, `react/compiler-runtime`, `react-dom`, `react-router` and `@availabs/dms` **externalized**. The host emits an import map that points those bare specifiers at the host's own singleton ESM builds, and adds an `integrity` map. Multiple import maps merge since Chrome 133 / Safari 18.4. Firefox support was unclear at the time of checking, and the `es-module-shims` polyfill covers it ([caniuse](https://caniuse.com/wf-import-maps-multiple), [Shopify "resilient import maps"](https://shopify.engineering/resilient-import-maps)). On the server, Node resolves the same bare specifiers by loading plugins from a directory where `react` etc. resolve to the host's copy (symlinked `node_modules` or a `module.register` resolve hook). Pros: simple, standard, cacheable. Cons: you build version negotiation yourself, and the host has to ship un-bundled ESM entry points for its shared modules.
3. **Build-time integration** (not runtime): plugins are npm packages that the host build includes. The most robust option, but it needs a client rebuild per install. Fine for first-party plugins and per-site builds.

**Pitfalls and mitigations:**

- **Duplicate React** breaks hooks ("Invalid hook call") and context identity. A `ThemeContext` from plugin-bundled `@availabs/dms` is a *different* context. Externalize React *and every module that owns a context* (dms core, router), and enforce it in CI by failing the plugin build if `react` code appears in its output.
- **React Compiler runtime.** With `target: '19'` (the default), compiled output imports `react/compiler-runtime`, so it shares the host's React. Plugins must target 19 and must not bundle `react-compiler-runtime` ([react.dev compiling libraries](https://react.dev/reference/react-compiler/compiling-libraries)). Plugins built with the compiler and those built without it can coexist.
- **Tailwind 4 classes.** The host's CSS is generated from classes it scanned at build time, so plugin classes aren't in it. Options, best first:
  - (a) **The plugin ships its own compiled CSS**, built against the host's theme tokens (`@import "@dms/tokens"`). Load it as a `<link>` in a lower `@layer`.
  - (b) A **prefix**: `@import "tailwindcss" prefix(xx)`. The plugin's utilities then can't collide with the host's. In v4 the prefix takes the form of a variant, written `xx:flex`. It also prefixes CSS variables (`--xx-color-…`) ([tailwindcss.com, "Using the prefix option"](https://tailwindcss.com/docs/styling-with-utility-classes)).
  - (c) Rebuild host CSS with `@source` on plugin directories at install time. This couples install to a client build and has known monorepo and `node_modules` scanning issues.

  Preflight/base styles must come only from the host. Plugins should emit `@layer utilities/components` only. Theme-token plugins (DMS themes) are mostly JS objects plus class strings, so (a) or (c) is needed for any new utility classes they reference.
- **SSR.** The Node SSR process must load the *same* plugin version as the client, so the manifest pins the version for both. Server-side loaded remote modules stay in Node's module cache forever (section 4). With RSC (`@vitejs/plugin-rsc`), a plugin's server components need a server build of the plugin. Treat RSC plugins as first-party only until that path stabilises.
- **CSP + SRI**: plugin asset URLs and their hashes come from the signed manifest. `script-src` allows only the host origin plus nonces.

---

## 4. Hot install and hot reload without restart

**Why in-process hot reload is fragile in Node:**

- The **ESM loader cache is not exposed or evictable**. Re-importing with `?v=…` creates a *new* module record and keeps the old one forever. Node maintainers say this means "always increasing memory usage" ([nodejs/modules#307](https://github.com/nodejs/modules/issues/307)). `import-fresh`'s README calls it "an unavoidable memory leak" for dev use only.
- Old module instances keep timers, DB pools, event listeners and closures alive. Express routers can be swapped through an indirection (`app.use((req,res,next)=>current(req,res,next))`), and in-flight requests finish on the old router. But nothing guarantees the old code is ever collected.
- `require.cache` deletion (CJS) has the same leak-and-stale-reference problems and doesn't apply to ESM.
- In-process reload is acceptable for **dev** and for **data-only** plugin parts (themes as JSON, config, manifests).

**What production platforms do:**

- **Grafana**: backend plugins are subprocesses, but installing or updating plugins conventionally requires a Grafana restart **[widely documented. Not re-verified for Grafana 12]**.
- **Backstage / Red Hat Developer Hub**: dynamic plugins are loaded at startup from the dynamic-plugins root. Changes roll out by **restarting the pod** ([RHDH docs](https://docs.redhat.com/en/documentation/red_hat_developer_hub/1.8/html-single/installing_and_viewing_plugins_in_red_hat_developer_hub/index)).
- **VS Code**: restarts the *extension host process*, not the editor.
- **Shopify, Atlassian Forge, Cloudflare**: plugin code runs in separate, independently deployed runtimes (workers, Lambdas, isolates). Install means deploying a new isolate, and the host never reloads.
- **WordPress** hot-installs in-process only because PHP is shared-nothing per request.

**Recommended DMS pattern:**

1. **Install** = download → verify (section 5) → extract to `plugins/<name>/<version>/` (immutable, content-addressed) → run migrations (section 7) → mark the version *installed* in a registry table.
2. **Client assets need no restart.** The SSR/HTML layer reads the per-tenant plugin manifest per request (cached, with invalidation via Postgres `LISTEN/NOTIFY`).
3. **Server code is loaded by a new process, never by a running one:**
   - **Out-of-process plugins** (tier 2/3): the supervisor starts the new plugin process, health-checks it, flips the RPC route, drains and stops the old one. This is per-plugin, so the host never restarts.
   - **In-process plugins** (tier 1): **rolling restart of the host**. Run ≥2 host instances. Then either (a) nginx upstream with `max_fails` / health checks and drain one at a time, (b) Node `server.listen({ port, reusePort: true })` (added **v23.1.0 / v22.12.0**, Linux 3.9+) so old and new processes share the port during handoff ([Node net docs](https://nodejs.org/api/net.html)), (c) PM2 cluster-mode `pm2 reload` (zero-downtime worker-by-worker), (d) systemd socket activation, or (e) a Docker health-checked swap (start the new container, wait for healthy, switch the nginx upstream, `SIGTERM` the old one with a grace period). On the DMS single host, (a) or (e) is the easiest fit with the current nginx + Docker setup. Graceful shutdown means: stop accepting, `server.close()`, finish in-flight requests, close pools, let the task queue checkpoint or re-queue jobs.
4. **Activate / deactivate per tenant** = a row change. Every plugin route, Falcor path, pattern type and theme is registered globally but **gated per request** by `tenant.activePlugins`. No reload is needed, and deactivation acts as an instant kill switch.

---

## 5. Supply chain

**Incidents that should shape the design:**

- **event-stream (2018)**: a maintainer handoff led to a targeted payload. **ua-parser-js (Oct 2021)**: account hijack, cryptominer and stealer.
- **chalk/debug and 16+ packages (2025-09-08)**: a maintainer was phished by a fake npm-support email. Malicious versions of `debug`, `chalk`, `ansi-styles`, `strip-ansi` (billions of weekly downloads) were live for about 2 hours ([BleepingComputer](https://www.bleepingcomputer.com/news/security/self-propagating-supply-chain-attack-hits-187-npm-packages/), [CyberProof](https://www.cyberproof.com/blog/guide-to-recent-node-package-manager-npm-compromise/)).
- **Shai-Hulud (mid-Sept 2025)**: a self-propagating worm (≈187+ packages) that stole npm and GitHub tokens and used them to republish *other packages by the same maintainer*. It planted a `shai-hulud` GitHub Actions workflow to exfiltrate CI secrets ([Unit 42](https://unit42.paloaltonetworks.com/npm-supply-chain-attack/)).
- **Shai-Hulud 2.0 "Second Coming" (≈2025-11-21–24)**: a **`preinstall`** script (`setup_bun.js` / `bun_environment.js`), roughly 600–800 packages (Zapier, ENS, PostHog, Postman, AsyncAPI), and ~25k GitHub repos of exfiltrated secrets. Its fallback deleted the home directory ([Datadog](https://securitylabs.datadoghq.com/articles/shai-hulud-2.0-npm-worm/), [Wiz](https://www.wiz.io/blog/shai-hulud-2-0-ongoing-supply-chain-attack), [The Register](https://www.theregister.com/2025/11/24/shai_hulud_npm_worm/)). Counts vary by vendor.
- **npm's response**:
  - Classic tokens can no longer be created (2025-11-05) and existing ones were revoked.
  - Write-scoped granular tokens default to a 7-day lifetime (90-day maximum).
  - Mandatory 2FA. The roadmap is to deprecate TOTP and push trusted publishing ([GitHub plan](https://github.blog/security/npm/our-plan-for-a-more-secure-npm-supply-chain/), [changelog 2025-11-05](https://github.blog/changelog/2025-11-05-npm-classic-tokens-revoked-session-based-auth-and-cli-token-management-now-available/)).
- **OWASP Top 10 2025** added **A03 Software Supply Chain Failures** ([owasp.org](https://owasp.org/Top10/2025/A03_2025-Software_Supply_Chain_Failures/)).

**Controls for a plugin pipeline:**

- **Build provenance and signing.** Build plugins in CI only (GitHub Actions). Use **npm trusted publishing** (OIDC, no long-lived token; npm CLI ≥11.5.1, Node ≥22.14; provenance automatic) ([docs.npmjs.com/trusted-publishers](https://docs.npmjs.com/trusted-publishers)). For non-npm artifacts, use **GitHub artifact attestations** / `cosign sign-blob` (keyless, Sigstore Fulcio cert bound to the workflow identity, Rekor transparency log). Verify with `npm audit signatures` (npm ≥9.5 for attestations), `gh attestation verify` or `cosign verify-blob --certificate-identity … --certificate-oidc-issuer https://token.actions.githubusercontent.com`. **Pin the expected signer identity** (repo + workflow path + ref), not just "is signed".
- **SLSA**: v1.2 is current. It has a **Build track** (L1 provenance exists, L2 hosted and signed provenance, L3 hardened, isolated builder) and a new **Source track** ([slsa.dev/spec/v1.2](https://slsa.dev/spec/v1.2/build-track-basics)). GitHub-hosted builds with attestations reach Build L2, and reusable-workflow isolation reaches L3. Target L2 for partner plugins and L3 for anything in the public registry.
- **GitHub as a source.** Tags and release assets were historically mutable. **Immutable releases went GA 2025-10-28**: tags of immutable releases can't be moved or deleted, assets are locked, a signed release attestation is generated, and the protection survives repo deletion. Verify with `gh release verify` / `gh release verify-asset` ([changelog](https://github.blog/changelog/2025-10-28-immutable-releases-are-now-generally-available/), [docs](https://docs.github.com/en/code-security/concepts/supply-chain-security/immutable-releases)). Even so, **the install URL should carry a digest**, e.g. `…/plugin-1.4.0.tgz#sha256=…`, or the registry index should supply it. Pin source to a commit SHA, not a tag.
- **Integrity on install.** Check SHA-256 of the archive against the signed index, verify the signature, extract to a fresh directory with no path traversal (reject `..`, absolute paths and symlinks pointing outside), then compare file hashes to the plugin's own manifest.
- **Dependencies: vendor-bundle at build time.** Plugins should ship as **a single pre-bundled artifact** (server bundle + client ESM + CSS), with third-party deps bundled in and only host-provided modules (react, dms SDK, pg-via-SDK) external. Then:
  - The host **never runs `npm install`**, so there are no install scripts on the server (the Shai-Hulud 2.0 vector).
  - What was reviewed is exactly what runs, which allows reproducible-build checks.
  - The artifact is self-contained for rollback.

  Cost: duplicated code across plugins, and the plugin author must rebuild to pick up a dependency CVE fix. An SBOM makes that visible. Native deps (e.g. `sharp`, `gdal` bindings) can't be bundled. Those plugins must run in a container image instead (tier 3), or the host provides the capability through the SDK (e.g. `ctx.gdal.ogr2ogr(...)`).
- **If installing at install time is unavoidable**: `npm ci --ignore-scripts` from a committed lockfile with `integrity` hashes, or pnpm ≥10. pnpm blocks dependency lifecycle scripts by default, uses an `allowBuilds` allow-list (pnpm 11 removed `onlyBuiltDependencies`), and has `minimumReleaseAge` to wait out fresh malicious releases ([pnpm supply-chain docs](https://pnpm.io/10.x/supply-chain-security), [pnpm 11](https://pnpm.io/blog/releases/11.0)). Run the install in a throwaway container without host secrets or network beyond the registry.
- **SBOM and vetting.** Generate CycloneDX/SPDX in plugin CI and attach it as an attestation. Scan with OSV-Scanner / `npm audit` and a behavioural scanner (Socket) at publish *and* periodically against installed versions. Use a release-age cool-down for dependency bumps.
- **Typosquatting and takeover.** Use namespaced plugin IDs (`@publisher/plugin`) with verified publishers. The host only accepts plugins whose signer identity is on the tenant- or platform-level allow-list.

---

## 6. Registry design

Phased:

1. **Phase 0 (first-party): a static signed index.** `index.json` lists `{name, version, hostApi: "^2.1", artifacts: {server, client, css}, sha256, sigstoreBundle, minHost, yanked}`. Host it on S3 or GitHub Pages, signed with a key or Sigstore. The host polls it and verifies. Cheap and auditable.
2. **Phase 1 (partners): TUF-style metadata** (root / targets / snapshot / timestamp roles) on the same static index. TUF defends against rollback, freeze, mix-and-match and key-compromise attacks, which a single signed file doesn't. Sigstore itself distributes its root of trust via TUF. Libraries: `python-tuf`, `go-tuf`, `tuf-js` (used by npm's sigstore client) **[library versions not re-checked]**.
3. **Alternatives considered:**
   - **Verdaccio** (self-hosted npm). Familiar `npm publish` flow, scopes and auth. It brings npm semantics we don't want (install-time resolution, scripts), and it doesn't natively verify attestations.
   - **OCI registry + ORAS**. Push arbitrary files as OCI artifacts. Directories are tarred, blobs are content-addressed. `cosign sign` the digest and attach SBOMs via the referrers API ([Sigstore "other types"](https://docs.sigstore.dev/cosign/signing/other_types/), [ORAS](https://oras.land)). A good fit if container-packaged tier-3 plugins appear, because one registry (GHCR) then serves images *and* plugin tarballs, with digests and signatures as first-class features.

**Registry semantics:**

- **Namespaces**: `@publisher/name`. A verified publisher is bound to a GitHub org or OIDC identity, and only that identity's Sigstore cert can sign the namespace.
- **Versions**: semver. Each release declares `hostApi` (the semver range of `@dms/plugin-sdk`) and optionally `requires: {otherPlugin: range}`. The host refuses to activate an incompatible version. The SDK follows strict semver, with deprecations kept for ≥1 major version.
- **Yank vs deprecate**: *yank* hides a version from new installs and flags existing installs with an alert. A *security yank* also triggers the kill switch (section 7). Deprecation is informational. Never delete artifacts, so that rollback and forensics stay possible.
- **Per-tenant pinning**: tenants activate `name@exact-version`. Platform-wide "installed versions" are the union of pinned versions, so multiple versions may be installed side by side in versioned directories. Auto-upgrade is opt-in per tenant, within a range such as patch only. Server code for N versions in one host process multiplies memory. Pin server-side plugins to one or two concurrent versions per host.

---

## 7. Operations

- **Migrations**:
  - Plugins ship numbered, forward-only migrations, with optional `down` used only for uninstall.
  - The host runs them in a transaction with an advisory lock and records them in `plugin_migrations(plugin, version, tenant, applied_at, checksum)`.
  - **Where data lives:** (a) per tenant: tables in a plugin schema per tenant (`dms_<app>__<plugin>`). Clean isolation and easy deletion, but migrations run N_tenants times on activation and upgrade. (b) shared: one `plugin_<name>` schema with `tenant_id` + RLS. One migration, but the isolation burden moves to policies. DMS already uses per-tenant schemas `dms_<app>`, so (a) matches existing operations. Pick (b) only for high-tenant-count lightweight plugins.
  - **Expand/contract** (additive change, deploy, backfill, then remove) is what makes rollback safe without `down` migrations.
- **Upgrade / rollback**: install the new version alongside the old one. Migrate (expand only). Switch the tenant pin (canary tenant first). Watch error rate and latency per plugin. Rollback flips the pin back, and the code is still on disk. Contract migrations run only after the old version is retired everywhere.
- **Uninstall and retention**: deactivation keeps data. Uninstall enters a "pending delete" grace period (e.g. 30 days, export available). Purge then drops the plugin schema, roles, secrets, queue schedules and stored files. All of these must be **owned by the plugin's role or prefix**, so the purge is mechanical. The DAMA delete-cascade lessons apply: make sure no dangling references remain.
- **Observability**:
  - Every log line, metric and trace span carries `plugin`, `plugin_version` and `tenant`.
  - Out-of-process plugins attribute naturally (per-process CPU/RSS via cgroups, `pg_stat_activity.application_name = plugin:<name>`, per-role `pg_stat_statements`).
  - In-process plugins need `AsyncLocalStorage` context propagation and wrapping of route handlers and job runners to attribute time and errors.
  - Per plugin, track request rate, error rate, p95, DB time, queue job durations and failures, and memory.
- **Kill switches**:
  - (1) Per tenant: deactivate (a row change).
  - (2) Platform-wide: a `disabled` flag on the plugin version, checked by the request gate, the job runner and the client manifest. Push it via `LISTEN/NOTIFY`.
  - (3) Out-of-process: stop the plugin service.
  - (4) A security yank in the registry sets (2) automatically on next poll.
- **Health checks**: plugin processes expose `/healthz` (liveness) and `/readyz` (dependencies). The supervisor restarts with backoff and circuit-breaks after N crashes, which marks the plugin "degraded" in the UI rather than failing host pages. Client side, each plugin slot is wrapped in a React error boundary (MF 2.0 has built-in error-boundary integration) with a fallback.
- **Crash isolation**: in-process, an unhandled rejection or OOM in a plugin takes down the host. That is the strongest *operational* (not security) argument for moving data-type workers out of process even for first-party plugins.
- **Quotas**: cgroup CPU and memory per plugin process, DB connection limit per plugin role, queue concurrency per plugin per tenant, request rate limits per plugin route, and storage quotas.

---

## Threat model

| # | Threat | Mitigation options | Cost |
|---|---|---|---|
| T1 | Malicious or compromised **server plugin** reads DB credentials, `process.env`, other tenants' data, DAMA DBs | Out-of-process plugin, own uid, `env:{}`, per-plugin Postgres role and pool, host-mediated DAMA access; container + seccomp for untrusted | Med–High: RPC SDK, supervisor, role management |
| T2 | Plugin code escapes an in-process "sandbox" (vm / vm2 / permission-model bypass) | Don't rely on in-process sandboxes for hostile code. Process or container boundary. Keep Node patched (permission-model CVEs in 2025–26) | Low (a policy decision) |
| T3 | Malicious **client plugin** acts as the user (same-origin `fetch`, DOM scraping, phishing UI) | Trust tier: only signed/reviewed code same-origin. Untrusted UI in a cross-origin sandboxed iframe or remote-dom worker with scoped short-lived tokens. CSP `connect-src`, Trusted Types | Low for trusted; High for iframe/remote-dom (separate API surface, no SSR) |
| T4 | Tampered artifact (moved GitHub tag, replaced asset, MITM, compromised CDN) | Digest pinning, immutable releases, Sigstore signature with pinned signer identity, SRI in import map/manifest | Low |
| T5 | Compromised **plugin dependency** (chalk/debug, Shai-Hulud-style) | Bundle deps at plugin build. Never `npm install` on host. CI uses pnpm with scripts blocked + `minimumReleaseAge`. Socket/OSV scans. SBOM attestation | Low–Med |
| T6 | Compromised **publisher account / CI token** | Trusted publishing (OIDC), no long-lived tokens, 2FA/passkeys, signer-identity allow-list, TUF threshold signing for the index | Low–Med |
| T7 | Registry compromise / rollback to a vulnerable version / freeze | TUF metadata (timestamp + snapshot roles), host refuses downgrade below the yanked floor | Med |
| T8 | Resource exhaustion (CPU loop, memory, DB locks, runaway queue jobs) | cgroups, `--max-old-space-size`, role `statement_timeout` + `CONNECTION LIMIT` + supervisor cancel, queue concurrency caps, watchdogs | Low–Med |
| T9 | SSRF / data exfiltration via plugin outbound HTTP | Egress proxy with per-plugin allow-list from the manifest. Block metadata IPs and internal ranges | Med |
| T10 | Cross-tenant leakage in shared plugin tables | Per-tenant schemas, or RLS keyed on an unforgeable role (not a GUC the plugin can `SET`) | Low–Med |
| T11 | Path traversal / zip-slip during install | Safe extractor, reject `..`, absolute paths and symlinks, extract as an unprivileged user into a fresh directory | Low |
| T12 | Bad upgrade corrupts data or breaks pages | Expand/contract migrations, canary tenant, side-by-side versions, per-tenant pin rollback, backups before migration | Med |
| T13 | Plugin crash takes down the host (in-process) | Out-of-process workers, error boundaries client-side, `unhandledRejection` attribution and auto-disable | Low–Med |
| T14 | Secrets leakage (env vars, logs, crash dumps) | Secret store per plugin per tenant via `ctx.secrets`, redaction in plugin loggers, never pass host env | Low |
| T15 | Supply-chain attack on the **host's** own build pulling plugin code at build time | Build-time plugins pinned in the lockfile with integrity, CI with no publish secrets in install steps | Low |

---

## Recommended approach for a React + Node multi-tenant platform, by trust tier

The SDK API stays **the same across tiers**. Only the transport and enforcement change. A plugin can then move between tiers without a rewrite.

### Tier 1 — First-party plugins (written by us)
- **Runtime:** in-process ESM `import()` into the host, plus task-queue workers.
  - Reason: maximum integration (SSR, RSC, Falcor routes, themes, React context) and no RPC overhead. Isolation buys little against our own code.
  - **But** run *data-type workers* that shell out to GDAL in their own processes anyway, for crash and resource isolation.
- **Client:** MF 2.0 remotes or externalized ESM + import map, with shared singletons (react, react-dom, react-router, `@availabs/dms`). Compiler `target: '19'`. Plugins ship their own compiled Tailwind CSS against host tokens.
- **Install:** CI-built, signed (Sigstore keyless from our GitHub Actions), immutable GitHub release + digest. The host verifies, extracts to a versioned directory, and runs migrations. Then a **health-checked rolling restart** of the host (two containers behind nginx, or `reusePort` handoff). Client-only plugins need no restart.
- **Activation:** per-tenant row, gated per request. Instant, and doubles as a kill switch.
- **Why:** in Node, hot-loading server code without restart either leaks or is unsafe. A 30-second rolling restart is boring and reliable, which is what Backstage/RHDH and Grafana effectively do.

### Tier 2 — Vetted partner plugins (contracted, code-reviewed)
- **Server:** a **separate process per plugin**, a Node child process or container under a supervisor.
  - Uses its own uid and `env:{}`, plus Node `--permission` with fs and network grants as an extra seat belt (not the boundary).
  - Holds its own **Postgres LOGIN role** with schema-only grants, a role-level `statement_timeout` and a connection limit. DAMA access is host-mediated.
  - Network is restricted to an egress allow-list, and secrets come via `ctx.secrets`.
  - The host proxies `/plugins/<name>/*` HTTP routes and Falcor paths to it over RPC.
  - Install and upgrade restart only that process (start new → health → switch → drain old), so **no host restart**.
- **Client:** same-origin is acceptable *only* with code review of the exact signed artifact, CSP, and SRI. Otherwise use iframe slots. SSR components from partners need the same review bar as server code.
- **Supply chain:** SLSA Build L2+ (their CI with provenance), signer identity on our allow-list, Socket/OSV scan at intake and on every version, deps bundled, no install scripts.
- **Why:** reviewed partner code is still exposed to *its own* supply chain (Shai-Hulud hit legitimate maintainers). A process boundary plus a scoped DB role limits the blast radius to that plugin's data at a modest operational cost.

### Tier 3 — Untrusted third-party plugins (open registry)
- **Server:**
  - Either **WASM** (Extism/Javy or a component-model component) for pure logic hooks, with host functions as the only capabilities;
  - or a **container per plugin** (gVisor if possible) with a seccomp profile, no host network except the egress proxy, a cgroup quota, and an RPC-only SDK with **no raw SQL**. Host-mediated queries enforce tenant scoping.
  - Never isolated-vm / vm / SES alone. If a JS-isolate route is used (the Directus model) it must sit inside a dedicated, privilege-dropped process, as both isolated-vm's README and Cloudflare's design advise.
- **Client:** **no same-origin code.** UI runs in a cross-origin `sandbox="allow-scripts"` iframe or in a worker + remote-dom rendering host-provided components. A scoped short-lived token is sent via `postMessage`. There is no SSR of plugin UI (placeholder plus client hydration).
- **Registry:** TUF-signed index, verified namespaces, mandatory provenance (SLSA Build L3 reusable workflow), automated scanning, human review for scope escalations, security-yank → automatic kill switch.
- **Why:** this is the only tier where the attacker is assumed to be the author. Every platform that runs truly untrusted code at scale (Cloudflare, Shopify, Figma, Forge) puts it behind at least one hard boundary — a process, VM or WASM sandbox, or a cross-origin frame — and talks to it only through a narrow capability API.

### Suggested order for DMS
1. Define `@dms/plugin-sdk` (capability interface + `hostApi` semver) and the manifest schema (scopes, artifacts, migrations).
2. Tier-1 pipeline: CI build → Sigstore attest → immutable release → host verify/extract → per-tenant activation gate → rolling restart via two containers behind nginx.
3. Move data-type workers to per-plugin processes with per-plugin PG roles. This yields crash isolation now and becomes tier 2 later.
4. Static signed index (phase 0 registry). Upgrade to TUF metadata before accepting outside publishers.
5. Tier-3 runtimes (iframe/remote-dom UI slots, WASM hooks, containerised workers) only when an actual third-party need appears.

### Open items / unverified
- Rolldown's *native* MF plugin status (no official doc page found). Grafana 12's restart requirement on plugin install. Red Hat-listed 2026 Node permission-model CVEs not yet checked against the Node advisory. Per-process Node RSS figure is a typical estimate.
