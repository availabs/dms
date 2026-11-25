# R3 (prior art) — How established platforms package, load, isolate and distribute plugins

Research item **R3 (prior art)** for the DMS plugin system. Compiled 2026-11-22 from primary sources
(official docs, source repos). Each claim carries its source URL inline. Items marked
**[unverified]** come from memory or secondary sources and could not be confirmed against a primary
source during this pass.

> Status: complete (first pass). ~5k words.

---

## 1. Grafana (v11–v13)

**Manifest.** `plugin.json` at the plugin root
(https://grafana.com/developers/plugin-tools/reference/plugin-json): `id` (must end in `-app`,
`-panel`, `-datasource` when published), `type` (`app` | `datasource` | `panel` | `renderer`),
`backend: bool`, `executable` (Grafana looks for `<executable>_<GOOS>_<GOARCH>` binaries — one
package carries both a JS frontend and per-platform Go binaries), `dependencies.grafanaDependency`
(**required**, a node-semver range such as `>=10.3.0`), `dependencies.plugins` (other plugins),
`includes` (pages/dashboards/nav entries with `role`), `routes` (proxy routes with auth-header
injection), `roles` (RBAC roles the plugin defines; actions must be prefixed with the plugin id),
`iam.permissions` (Grafana creates a **service account** for the plugin with exactly these RBAC
permissions and hands its token to the backend via `GF_PLUGIN_APP_CLIENT_SECRET` — Grafana ≥10.3,
behind `externalServiceAccounts`), `preload`, and `extensions` (declared `addedComponents`,
`addedLinks`, `exposedComponents`, `extensionPoints`; undeclared ones "won't work").

**Client loading.** The server-rendered index includes bootstrap data listing plugins and the URL of
each plugin's `module.js`; Grafana **lazy-loads** `module.js` when a panel/data source/app is first
used (apps can `preload`) (https://grafana.com/developers/plugin-tools/key-concepts/plugin-lifecycle).
Loading uses **SystemJS** with an import map: Grafana shares a fixed set of its own npm packages
(React, `@grafana/ui`, `@grafana/runtime`, …) and links them to the plugin's externals at runtime,
so the plugin's declared versions are only nominal
(https://grafana.com/developers/plugin-tools/key-concepts/npm-dependencies). A **Plugins Frontend
Sandbox** (public preview from 11.5, opt-in per plugin id via `enable_frontend_sandbox_for_plugins`)
restricted what plugin frontend code could touch in the DOM; it "has been deprecated and will be
removed in Grafana 13.4"
(https://grafana.com/docs/grafana/latest/administration/plugin-management/plugin-frontend-sandbox/).
Lesson: in-page JS sandboxing of a shared-React plugin was tried and abandoned.

**Server code.** Backend plugins are Go binaries run as **separate processes** via HashiCorp
**go-plugin** over **gRPC**: "Plugins can't crash your Grafana process. A panic in a plugin doesn't
panic the server"; plugins "only have access to the interfaces and arguments given to them"
(https://grafana.com/developers/plugin-tools/key-concepts/backend-plugins/). Grafana negotiates a
protocol version, restarts a crashed backend, and kills them on shutdown. The SDK caches one
**instance per configured data source/app**, disposed when its config changes — that is how
per-config state (connection pools) is managed.

**Install / restart.** Install = extract a zip into the plugins directory. Lifecycle (discovery →
signature check → registration in an in-memory registry) reruns on each start and is not stored in
the DB. "Use of the Grafana CLI to install or uninstall a plugin requires you to restart Grafana";
installing **from the in-app catalog works at runtime without a restart**
(https://grafana.com/developers/plugin-tools/key-concepts/plugin-lifecycle). Other routes: zip
for air-gapped installs, `plugins.preinstall` in config (≥11.5; prevents accidental uninstall and
allows auto-update), Helm `GF_PLUGINS_PREINSTALL_SYNC=id@version@url`
(https://grafana.com/docs/grafana/latest/administration/plugin-management/plugin-install/). No
documented rollback beyond installing a prior version.

**Activation scope.** Install is **server-wide** (Server Admin); app-plugin **configuration and
enabling is per organisation** (Org Admin configures but cannot install)
(https://grafana.com/docs/grafana/latest/administration/plugin-management/). That split — operator
installs, tenant admin enables/configures — is the closest match to DMS's requirement.

**Trust.** Every plugin is signature-checked at load. Levels: **private** (one's own instance, bound
to its root URLs), **community** and **commercial** (both listed in the catalog). Status
`unsigned` ⇒ "Grafana neither loads nor starts it"; `modified` ⇒ "may indicate malicious intent".
Escape hatch `allow_loading_unsigned_plugins=<ids>` (logs a warning; not allowed in Grafana Cloud)
(https://grafana.com/docs/grafana/latest/administration/plugin-management/plugin-sign/). Signing
covers a `MANIFEST.txt` of file hashes signed by Grafana's key **[MANIFEST detail from memory —
not on the fetched page]**. Catalog submissions are reviewed by Grafana Labs before signing.

**Registry.** grafana.com plugin catalog/API; versions per plugin with `grafanaDependency` used to
pick a compatible one.

---

## 2. Backstage (new backend + new frontend system) and Red Hat Developer Hub dynamic plugins

**Core model.** Upstream Backstage is "build your own app": plugins are npm packages added to the
app's `package.json` and compiled in; the **new backend system** registers plugins/modules
in-process via `backend.add(import('…'))`, and the **new frontend system** composes "extensions"
via `createFrontendPlugin`. Both are in-process with shared singletons — no isolation.

**Dynamic loading (experimental upstream).** `@backstage/backend-dynamic-feature-service` adds a
`dynamicPluginsFeatureLoader`: it scans `dynamicPlugins.rootDirectory`, validates each package,
loads the code and registers it as a backend feature; it also **serves frontend plugins as Module
Federation remotes**, consumed by `@backstage/frontend-dynamic-feature-loader` (new frontend system
only) (https://backstage.io/docs/reference/backend-dynamic-feature-service,
https://www.npmjs.com/package/@backstage/frontend-dynamic-feature-loader). Still marked experimental.

**RHDH (productised).** Dynamic plugins can be added/removed "without rebuilding the app … only a
restart is required" (https://github.com/redhat-developer/rhdh/blob/main/docs/dynamic-plugins/index.md).
- *Derived packages.* A dynamic plugin is "a special JavaScript package that is derived from an
  original plugin package": `npx @red-hat-developer-hub/cli plugin export` writes `dist-dynamic/`
  with a `-dynamic` suffix. **Shared** deps (by default all `@backstage/*`) become
  `peerDependencies` supplied by the host; **embedded** deps (by default `*-node`, `*-common`) are
  bundled; other private deps ship in a private `node_modules` (bundleDependencies). Frontend export
  generates **Scalprum** (Module Federation) assets with a default `PluginRoot` exposed module.
  Derived packages "should not be pushed to the public npm registry"
  (https://github.com/redhat-developer/rhdh/blob/main/docs/dynamic-plugins/export-derived-package.md).
- *Distribution.* Preferred: **OCI image** (`plugin package` builds it with podman), referenced as
  `oci://registry/image@digest!plugin-name`; alternatives: npm package + version (private registry
  via `.npmrc`), `.tgz` URL, or local directory (dev only). **`integrity` (sha512) is required** for
  npm and tgz sources; digests recommended for OCI
  (https://github.com/redhat-developer/rhdh/blob/main/docs/dynamic-plugins/installing-plugins.md).
- *Install.* An `install-dynamic-plugins` **init container** reads `dynamic-plugins.yaml`
  (`package`, `enabled`, `integrity`, `pluginConfig`), takes a lock file, downloads/extracts, and the
  main container loads from the shared directory. Frontend wiring is **declarative config**
  (`dynamicPlugins.frontend.<pkg>.mountPoints`, `dynamicRoutes`, `entityTabs`) rather than code in
  the host app. A catalog-index OCI image can supply default config.

**Activation scope.** Per Backstage instance (one org). No per-tenant concept.

**Trust.** None beyond integrity hashes and Red Hat's support tiers for its own plugins.

---

## 3. Directus (v11, extensions + marketplace)

Directus is the closest analogue to DMS on the Node side (Node API + SPA admin, one package can carry
both), and its source is worth reading directly.

**Manifest.** `package.json` → `"directus:extension"`: `type` (interface, display, layout, module,
panel, theme = *app*; hook, endpoint = *api*; operation = *hybrid*; or `bundle`), `path`/`source`,
`host` (semver range for Directus — `^` is limited to the major), and optional `sandbox`
(`enabled`, `requestedScopes`). **Bundles** list `entries[]` (`type`, `name`, `source`) so one npm
package ships app + api parts sharing deps; `partial` controls whether entries can be disabled
individually (https://directus.com/docs/guides/extensions/bundles,
https://directus.com/docs/guides/extensions/marketplace/publishing).

**Client loading.** On every (re)load the **server bundles all enabled app extensions into one ES
module with rollup** (opt-in rolldown via `EXTENSIONS_ROLLDOWN`), marking host libraries
(`APP_SHARED_DEPS`: Vue, `@directus/extensions-sdk`, …) as externals mapped to the app's own chunks;
the Data Studio downloads those chunks (source: `api/src/extensions/manager.ts`,
`generateExtensionBundle`, https://github.com/directus/directus/blob/main/api/src/extensions/manager.ts).
App extensions are **not** sandboxed.

**Server code.** Two modes in the same process:
- *Unsandboxed* hook/endpoint/operation extensions are imported directly with full access to
  services, DB and env.
- *Sandboxed* API/hybrid extensions run in an **isolated-vm** V8 isolate
  (`new ivm.Isolate({ memoryLimit: EXTENSIONS_SANDBOX_MEMORY })`, evaluation under
  `EXTENSIONS_SANDBOX_TIMEOUT`) with "access to JavaScript standard built-in objects" only; host
  capabilities arrive as `ivm.Reference` host functions exposed through a virtual `directus:api`
  module (`log`, `sleep`, `request`), each gated by **requested scopes** (e.g. `request.urls` with
  wildcards, `request.methods`) declared in `package.json`
  (https://directus.com/docs/guides/extensions/api-extensions/sandbox; `isolated-vm` is a direct
  dependency in `api/package.json`). Route/filter/action/operation registration is proxied across
  the isolate boundary (`api/src/extensions/lib/sandbox/register/*`).

**Install without restart — yes.** The marketplace installer downloads the npm tarball from the
Directus registry (`@directus/extensions-registry`), extracts it to `extensions/.registry/<versionId>`,
then calls `reload()`: a single-concurrency queue that **syncs, unloads all extensions, loads them
again, re-bundles the app extensions, and emits `extensions.reload`**. In multi-instance deploys it
**publishes on a bus channel `extensions.reload`** so other API nodes reload too (manager.ts lines
~200–400; `lib/installation/manager.ts`). `EXTENSIONS_LOCATION` can load extensions from shared
object storage, with a sync step per node. `EXTENSIONS_AUTO_RELOAD` watches the filesystem in dev.
`EXTENSIONS_MUST_LOAD` makes a failing extension fatal. No version rollback beyond reinstalling.

**Activation scope.** Per Directus project (instance); extensions can be enabled/disabled in
Settings → Extensions (bundle entries individually unless `partial: false`). No multi-tenant scope.

**Trust.** `MARKETPLACE_TRUST=sandbox` (default) lets the in-app marketplace install **all app
extensions but only sandboxed API extensions**; `all` admits unsandboxed ones (self-hosted /
Enterprise Cloud) (https://directus.com/docs/raw/configuration/extensions.md). Extensions can be
removed from the marketplace if malicious. `EXTENSIONS_LIMIT` caps marketplace installs. The
sandbox announcement (2023-10-27, v10.7) admitted the earlier state "really leave[s] it to Directus
project admins to understand the security implications"
(https://directus.com/resources/announcing-secure-extensions-framework). Directus replaced **vm2**
with isolated-vm (v10.6) after a vm2 escape in its Flows "Run Script" operation
(https://advisories.gitlab.com/pkg/npm/directus/GMS-2023-2358/).

**Registry.** npm is the source of truth; packages with keyword `directus-extension` are mirrored
into `registry.directus.com` "every few hours, and only the latest version … is available in the
Marketplace". `MARKETPLACE_REGISTRY` points at an alternate registry.

---

## 4. Strapi 5, Payload 3, Medusa 2, Keystone 6 — "plugin = npm dependency + rebuild"

These Node CMS/commerce frameworks all treat a plugin as a **build-time npm dependency of the
project**. None installs at runtime.

- **Strapi 5.** A plugin has two parts in two folders: `admin/` (Admin Panel API, entry
  `admin/src/index.ts`, registers menu links/injection zones) and `server/` (Server API: `register`,
  `bootstrap`, `destroy`, routes, controllers, services, content-types); `pluginId` derives from the
  `package.json` name; `dist/` holds both builds
  (https://docs.strapi.io/cms/plugins-development/plugin-structure). Install = `npm install` + entry
  in `config/plugins` + **rebuild the admin (`npm run build`) and restart** — stated in plugin READMEs
  rather than a single core-docs sentence, so treat the exact wording as **[secondary]**. The
  in-admin Marketplace only links to the Community Hub install instructions; badges mark
  "made by Strapi" and "verified by Strapi"
  (https://docs.strapi.io/cms/plugins/installing-plugins-via-marketplace). In-process, no isolation.
- **Payload 3 (Next.js).** "Payload Plugins simply take in an existing config and return a modified
  config" — a pure config transform run after validation, before sanitisation
  (https://payloadcms.com/docs/plugins/overview). Admin components are referenced by **file-path
  strings** (`'my-plugin/client#Field'`); Payload generates an `importMap.js` at startup/HMR, and
  "the import map is never regenerated during normal runtime" or after a production build — so a
  new plugin component needs `payload generate:importmap` + a Next build
  (https://payloadcms.com/docs/custom-components/overview). Components are **React Server Components
  by default**; `'use client'` opts out, and non-serialisable props are stripped across the
  boundary. Relevant to DMS's RSC experiments: the plugin contract is "path strings resolved at
  build time", not runtime module loading.
- **Medusa 2 (≥2.3).** One package may contain modules, API routes, workflows, subscribers,
  **scheduled jobs**, links and admin extensions (https://docs.medusajs.com/learn/fundamentals/plugins).
  `npx medusa plugin:build` compiles to `.medusa/server`; `package.json#exports` exposes `./admin`
  and `./providers/*`; Medusa packages are peer dependencies; registration is
  `plugins: [{ resolve, options }]` in `medusa-config.ts`; local dev uses **yalc**
  (`plugin:publish` / `plugin:develop`) (https://docs.medusajs.com/learn/fundamentals/plugins/create).
  Published to npm with keywords (`medusa-v2`, `medusa-plugin-integration`) for the integrations
  listing. Medusa is the closest *shape* to a DMS "data-type" plugin (routes + jobs + admin pages in
  one package), but it is build-time only.
- **Keystone 6.** No plugin system as such; extension is by composing the `config()` object and
  custom field types; the Admin UI is a Next app generated at `keystone build`
  **[from memory, not re-verified]**.

---

## 5. WordPress (6.x)

**Manifest.** A header comment in the main PHP file: `Plugin Name` (only required field),
`Version`, `Requires at least`, `Requires PHP`, `Requires Plugins` (slug dependencies, 6.5+),
`Network` (must be network-activated), `Update URI` (prevents a WordPress.org plugin of the same slug
from overwriting a third-party one), `Text Domain`, `License`
(https://developer.wordpress.org/plugins/plugin-basics/header-requirements/). Themes use the same
idea in `style.css`.

**Client/server.** PHP runs in-process per request; front-end assets are enqueued script/style
tags; block-editor code is prebuilt JS registered via `block.json`. **No isolation at all** — a
plugin has the full PHP process, DB and filesystem.

**Install / restart.** Because PHP loads code per request, **install, activate, update and
deactivate never need a restart**: upload a zip or install from the directory, the files are
unpacked into `wp-content/plugins/`, and the next request includes them. Activation runs
`register_activation_hook` (schema creation etc.). Auto-updates for plugins/themes are opt-in per
plugin since WP 5.5 (2020) **[date from memory]**. **Rollback:** 6.3 added a temporary backup that
restores the previous version if a *manual* update fatals on activation
(https://make.wordpress.org/core/2023/07/11/new-in-6-3-rollback-for-failed-manual-plugin-and-theme-updates/);
**Rollback Auto-Update** (merged May 2024, changeset 58128, 6.6 milestone) does the same for
automatic updates: it re-activates the plugin, catches a PHP fatal, restores the backup and emails
the admin (https://make.wordpress.org/core/2024/04/19/merge-proposal-rollback-auto-update/,
https://core.trac.wordpress.org/changeset/58128).

**Activation scope (Multisite).** Only the Super Admin installs code (network-wide files). A plugin
is then either **network-activated** (runs on every site) or **activated per site** by that site's
admin (if the network allows the Plugins menu); `Network: true` forces network-only
**[multisite UI behaviour from general knowledge]**. Code is shared; activation and options are
per site (`wp_N_options`). This is the classic "install once, activate per tenant" model, and it
works only because activation is enforced at load time per request.

**Trust and incidents.** WordPress.org runs a manual first review of each new plugin; since
2024-10-01 the **Plugin Check** tool and **2FA** are mandatory for submissions and 2FA for all
committers; SVN gets separate high-entropy passwords because "2FA cannot be applied to our existing
code repositories"; "Release Confirmations" add a deploy-time gate
(https://make.wordpress.org/plugins/2024/09/04/upcoming-security-changes-for-plugin-and-theme-authors-on-wordpress-org/,
https://make.wordpress.org/plugins/2024/10/01/plugin-check-and-2fa-now-mandatory-for-new-plugin-submissions/).
Trigger: the **June 2024 supply-chain attack** — five directory plugins (Social Warfare, Blaze
Widget, Wrapper Link Element, Contact Form 7 Multi-Step Addon, Simply Show Hooks) were pushed
malicious versions that created rogue admin accounts, because developers had **reused passwords**
leaked elsewhere; ~35,000 sites potentially affected
(https://www.wordfence.com/blog/2024/06/supply-chain-attack-on-wordpress-org-plugins-leads-to-5-maliciously-compromised-wordpress-plugins/,
https://www.wordfence.com/blog/2024/06/developer-accounts-compromised-due-to-credential-reuse-in-wordpress-org-supply-chain-attack/).
Wordfence reported further 2026 compromises of commercial plugin update channels (ShapedPlugin,
June 2026; BdThemes "via poisoned API response", Aug 2026) — **[headlines only; pages did not load]**.
Lesson: auto-update + full in-process trust means a compromised publisher account is a
fleet-wide RCE; WordPress has signatures on neither packages nor updates.

**Registry.** wordpress.org/plugins (SVN-backed; `readme.txt` with `Stable tag`; closure/removal
for security); commercial plugins update from vendor servers via `Update URI`.

---

## 6. VS Code extensions

**Manifest.** `package.json` with `engines.vscode` (semver range), `activationEvents`
(`onLanguage:*`, `onCommand:*`, `workspaceContains:*`, `onStartupFinished`, …; many are now inferred
from `contributes`), `contributes` (declarative: commands, menus, settings schema, views, themes,
grammars), `main` (Node entry) and/or `browser` (web-worker entry), `extensionKind`
(`ui`/`workspace`), `extensionDependencies`, `extensionPack`. Packaged as a `.vsix` zip.

**Runtime.** Extensions never run in the renderer. There are three **extension hosts**: a local
Node.js process, a **web extension host in a browser Web Worker**, and a remote Node host (SSH, WSL,
containers, Codespaces) (https://code.visualstudio.com/api/advanced-topics/extension-host).
Extensions needing Node get `main`, web-capable ones `browser`; placement follows `extensionKind`.
The host keeps extensions from blocking the UI and lets them be **lazy-activated** by activation
events. UI contributions are declarative (`contributes`) or webviews (sandboxed iframes with
`postMessage`), so extension code never touches the workbench DOM. The isolation is for
*stability/performance*, not security: "The extension host has the same permissions as VS Code
itself" (https://code.visualstudio.com/docs/configure/extensions/extension-runtime-security).

**Install / restart.** Install, enable, disable and update apply without restarting the window for
most extensions (the host loads new extensions dynamically; some updates still prompt "Restart
Extensions") **[behaviour from general knowledge]**. Enable/disable can be global or **per
workspace**.

**Trust.** Marketplace: multi-engine malware scan before publishing, name-squatting blocks,
**verified publisher** badge (domain ownership + six months' good standing), every package **signed
on publish and verified on install**, a **block list** that also **auto-uninstalls** installed
malicious extensions, a **publisher-trust prompt** on first install from a third-party publisher
(1.97+), and an **allowed-extensions** enterprise policy (same URL). Workspace Trust / Restricted
Mode limits what runs in untrusted folders. Incidents: the **GlassWorm** campaign (Oct 2025 →
2026) published credential-stealing extensions to **Open VSX** using **leaked publisher tokens**;
the Eclipse Foundation revoked tokens, introduced prefixed tokens for secret scanning, shorter
token lifetimes, and (reported) mandatory pre-publish checks from Feb 2026
(https://blogs.eclipse.org/post/mikaël-barbero/open-vsx-security-update-october-2025).

**Registry.** Visual Studio Marketplace (Microsoft) and Open VSX (Eclipse, vendor-neutral, used by
forks).

---

## 7. Figma plugins

**Model.** Plugin logic runs on the main thread in "a minimal JavaScript environment [that] does
not expose browser APIs" — only ES built-ins and a minimal `console`; no `fetch`, `setTimeout` or
DOM. UI and network live in an **iframe** (`figma.showUI`) that has browser APIs but **not** the
document; the two talk by `postMessage`
(https://developers.figma.com/docs/plugins/how-plugins-run/). Manifest: `id` (assigned by Figma),
`api` version, `main`, `ui`, `editorType`, `documentAccess: "dynamic-page"`, **`networkAccess.allowedDomains`**
(required; enforced by CSP; `reasoning` required for `*`), and `permissions`
(`currentuser`, `activeusers`, `fileusers`, `payments`, `teamlibrary`)
(https://developers.figma.com/docs/plugins/manifest/).

**Design history.** Figma's 2019 write-up explains why a null-origin iframe alone failed
(async-everywhere ergonomics; 14 s to serialise a large document), why they moved to the **Realms
shim** in-thread ("a whitelist rather than a blacklist … small and auditable") with a handle-based
**membrane**, and why, after a privately disclosed Realms escape, they switched to "compiling a
JavaScript VM written in C to WebAssembly" (QuickJS)
(https://www.figma.com/blog/how-we-built-the-figma-plugin-system/). Lesson: JS-level sandboxes in
the same realm are fragile; an interpreter in Wasm or a separate realm/process is the defensible
boundary.

**Scope / registry.** Plugins are installed per user (or managed per organisation on paid plans
**[from general knowledge]**); published through Figma Community with review.

---

## 8. Shopify apps, app extensions and Functions

Shopify is the reference design for *third-party code in a multi-tenant SaaS*.
- **Apps run out of process** on the developer's own infrastructure; they are **installed per
  shop** through OAuth with declared access scopes, and embedded in the admin through an iframe
  (App Bridge) **[iframe/App Bridge from general knowledge]**.
- **UI extensions** (checkout, customer accounts, admin, POS) "run inside of a Web Worker which
  doesn't have access to `window` or the DOM", rendered via **remote-dom** with Preact bindings
  into Shopify's web components; bundles capped at **64 KB** (128 KB for full-page account
  extensions); external calls require the `network_access` capability
  (https://shopify.dev/docs/api/checkout-ui-extensions). The host renders real UI from a
  serialized component tree — third-party code never touches the host DOM.
- **Functions** (discounts, delivery, validation) are **WebAssembly** modules invoked by Shopify
  with JSON from a declared GraphQL input query, returning JSON operations; any Wasm language, Rust
  recommended (https://shopify.dev/docs/apps/build/functions). (Instruction-count and size limits
  exist on a separate requirements page **[not fetched]**.)
- **Versioning.** "Your app configuration and all extensions are versioned together as a single
  app version"; `deploy` creates and releases a version that replaces the active one on every
  installed shop within minutes, and "you can revert to a previous app version at any time"
  (https://shopify.dev/docs/apps/build/app-extensions). Each extension has a
  `shopify.extension.toml`.
- **Trust.** App Store review; per-shop scope consent at install.

## 9. Atlassian Forge (added — multi-tenant SaaS analogue)

Forge apps are **installed per Atlassian site** and run on Atlassian's infrastructure.
`manifest.yml` declares modules, `runtime` (nodejs20/22/24.x), `permissions.scopes` (OAuth scopes,
"minimum set"), egress allow-lists `fetch.backend` / `fetch.client` ("Calls made to any domain that
is not defined in the manifest.yml … will be rejected"), and CSP needs for Custom UI (iframes)
(https://developer.atlassian.com/platform/forge/manifest-reference/permissions/,
https://developer.atlassian.com/platform/forge/runtime-reference/). **Versioning ties trust to
permissions:** minor versions roll out to all sites automatically; a version that *escalates*
permissions (scopes or egress) is a **major version that each site admin must approve**, and
"rolling releases" let code ship while permissions stay at the old level until approval
(https://developer.atlassian.com/platform/forge/versions/,
https://developer.atlassian.com/platform/forge/rolling-releases/).

---

## 10. Kibana / OpenSearch Dashboards

`bin/kibana-plugin install <name|https://…zip|file://…>`; "Kibana enforces that the installed
plugins match the version of Kibana" **exactly**, and the installer "rejects any plugins that
haven't been published for your specific version"; changing plugins **restarts the Kibana server**,
and removal triggers an "optimize" run; third-party plugins are unsupported and Elastic gives "no
backwards compatibility for plugins due to the high rate of change"
(https://www.elastic.co/guide/en/kibana/current/kibana-plugins.html). Plugins are in-process
(server: Node `setup/start/stop` lifecycle with declared `requiredPlugins`; browser: prebuilt
bundle per plugin). OpenSearch Dashboards inherits the same model and the exact-version pin
(`opensearch-dashboards-plugin install`) **[OSD from general knowledge]**. Lesson: when the plugin
API is the *entire internal surface*, compatibility collapses to "exact version only" — the
ecosystem withers. A narrow, versioned plugin API is what makes semver ranges meaningful.

## 11. JupyterLab (4.x) — prebuilt "federated" extensions

Two kinds: **source extensions** (npm packages; "Installing a source extension requires a user to
rebuild JupyterLab" — deprecated) and **prebuilt extensions**, compiled bundles shipped inside
**pip/conda** packages that copy assets to `<sys-prefix>/share/jupyter/labextensions/<pkg>`;
"Installing a prebuilt extensions does not require Node.js"
(https://jupyterlab.readthedocs.io/en/latest/extension/extension_dev.html). Prebuilt extensions use
**Module Federation** (now via Rspack). Shared dependencies are declared in
`package.json#jupyterlab.sharedPackages` with `bundled`, `singleton` and `strictVersion` flags;
providers of a DI token from a non-core package must set `singleton: true`, consumers
`bundled: false, singleton: true`. Activation is a **page reload**, not a server restart, for
frontend-only extensions; a server extension (Jupyter Server, Python, in-process) needs a server
restart. `disabledExtensions` and `overrides.json` give system/user-level enable/disable. Lesson:
the closest working example of **runtime-loaded React-like UI plugins with negotiated shared
singletons** — and of the cost: a plugin is tied to the host's shared-package version ranges.

## 12. Home Assistant + HACS

HACS installs from **public GitHub repositories only**; `hacs.json` (`name`, `homeassistant` min
version, `hacs` min version, `zip_release` + `filename`, `content_in_root`,
`persistent_directory`); "If the repository uses GitHub releases, the tag name from the latest
release is used" as the version — "just publishing tags is not enough"; without releases the
commit SHA is the version (https://hacs.xyz/docs/publish/start/). Python **integrations** load
in-process and need a **Home Assistant restart** (HACS raises a "restart required" repair)
(https://www.hacs.xyz/docs/use/download/download); dashboard **frontend plugins** (custom cards) are
plain ES modules registered as dashboard resources — a browser reload suffices **[from general
knowledge]**. No signing; inclusion in the HACS default list is a PR-reviewed allow-list of repos.
Lesson: "GitHub release = package" works for discovery and versioning, but HACS still needs a
curated index on top and offers no integrity guarantee beyond GitHub itself.

## 13. Obsidian

Community plugins ship as **GitHub release assets** (`main.js`, `manifest.json`, optional
`styles.css`); release tag must equal `manifest.json` version; the directory reads the manifest
from the default branch and Obsidian downloads assets from the matching release; review is now
**automated** via the community.obsidian.md directory, and a plugin isn't installable until
automated-review errors clear (https://docs.obsidian.md/Plugins/Releasing/Submit+your+plugin).
Runtime: plugins run inside the Electron renderer with full access — "Obsidian cannot reliably
restrict plugins to specific permissions"; **Restricted Mode** (default on) blocks all third-party
code; every version is automatically scanned and shown with a **safety scorecard**; popular or
flagged plugins get manual review (https://obsidian.md/help/plugin-security). Enable/disable is
hot (`onload`/`onunload` lifecycle) and **per vault**.

## 14. Discourse (plugins vs theme components)

**Plugins** (Ruby `plugin.rb` + Ember JS) are installed by adding a `git clone` to
`containers/app.yml` and running `./launcher rebuild app` — no hot install; uninstall is the
reverse (https://meta.discourse.org/t/install-plugins-in-discourse/19157). In a **multisite**
container every site gets the same plugin code; per-site activation is a site setting declared
with `enabled_site_setting`, and — key lesson — a Discourse developer notes Discourse "doesn't have
a clean way to undo the effects of a loaded plugin, so it trusts the plugin code to be checking
that setting" (https://meta.discourse.org/t/plugin-development-site-settings-enabled-checkbox-not-working/65460).
**Theme components** (CSS + JS/Glimmer + settings, one git repo each) are installed from a git URL
**in the admin UI at runtime, per site**, "even on shared hosting"
(https://meta.discourse.org/t/developer-s-guide-to-discourse-themes/93648). Discourse thus has two
tiers: hot-installable, per-tenant client-only customisations, and operator-installed server
plugins needing a rebuild.

## 15. Mattermost

Manifest `plugin.json`/yaml: `id` (reverse-DNS), `version`, `min_server_version`,
`server.executables` (map of `linux-amd64` etc. → binary), `webapp.bundle_path`,
`settings_schema` (renders the System Console settings page), `props`
(https://docs.mattermost.com/developers/integrate/plugins/manifest-reference). The server part is
Go and "runs as a subprocess of the Mattermost server process" (HashiCorp **go-plugin** — direct
dependency in `server/public/go.mod`); the web-app bundle "is included on the page and runs
alongside the web app code as a PluginClass" whose `initialize(registry, store)` registers React
components into named slots (https://docs.mattermost.com/developers/integrate/plugins/overview).
Plugins uploaded via console, REST or Marketplace "are persisted to the shared filestore and
deployed automatically to new and existing" cluster nodes; install and **enable are separate
steps**, both at runtime (System Console / `mmctl plugin enable`)
(https://docs.mattermost.com/administration-guide/configure/manage-plugins.html). Signing: optional
"Require plugin signature" (self-hosted) with extra trusted public keys
(`PluginSettings.SignaturePublicKeyFiles`); enabling it **disables uploads**; from v10.11
prepackaged plugins are signature-checked at startup; remote Marketplace at
`api.integrations.mattermost.com` (https://docs.mattermost.com/administration-guide/configure/plugins-configuration-settings.html).
Scope: per server (one workspace).

## 16. Nextcloud apps (+ ExApps)

PHP apps (`appinfo/info.xml` with dependency ranges) are installed from the App Store in the admin
UI at runtime (PHP per-request → no restart) and can be **limited to specific user groups**
**[group-limit from general knowledge]**. **Code signing:** developers get an X.509 certificate by
PR to `app-certificate-requests`; `occ integrity:sign-app` writes `appinfo/signature.json`
(SHA-512 per file + certificate + signature); checks report `INVALID_HASH`, `MISSING_FILE`,
`EXTRA_FILE`; failures show an admin warning rather than blocking; once an app has been signed,
**unsigned updates are refused**
(https://docs.nextcloud.com/server/latest/developer_manual/app_publishing_maintenance/code_signing.html).
**ExApps (AppAPI)** run non-PHP apps out-of-process under a **deploy daemon** (e.g. Docker),
authenticated with `AppAPIAuth` and talking to Nextcloud through the AppAPI OCS API
(https://docs.nextcloud.com/server/latest/developer_manual/exapp_development/Introduction.html) —
a recent example of a PHP host moving third-party server code into containers.

---

## 17. Package and registry models

- **npm.** `npm publish --provenance` / **trusted publishing** (OIDC from GitHub Actions, GitLab,
  CircleCI; npm ≥11.5.1) produces Sigstore **provenance attestations** automatically for public
  packages from public repos; npm recommends "Require two-factor authentication and disallow
  tokens" (https://docs.npmjs.com/trusted-publishers). After the **Shai-Hulud** self-propagating
  worm (Sept 2025), GitHub announced: no 2FA bypass for local publishing, FIDO-only 2FA, publishing
  granular tokens capped at **7 days**, legacy classic tokens deprecated, publishing access
  defaulting to "disallow tokens" (https://github.blog/security/supply-chain-security/our-plan-for-a-more-secure-npm-supply-chain/;
  rollout status **unverified**). Install-time `postinstall` scripts were the worm's vector — a
  plugin installer should never run lifecycle scripts.
- **JSR.** ESM/TypeScript source with `jsr.json` (`name`, `version`, `exports`), `@scope/name`,
  re-publishing a version is refused (immutable), OIDC tokenless publish from GitHub Actions with
  provenance (https://jsr.io/docs/publishing-packages).
- **Verdaccio** — self-hosted npm registry with uplinks/proxying to npmjs **[from general
  knowledge]**: the lowest-effort way to run a private "DMS plugin registry" that speaks the npm
  protocol.
- **GitHub releases.** Used directly by HACS and Obsidian; **artifact attestations**
  (`actions/attest-build-provenance`, `gh attestation verify`) give Sigstore-signed build
  provenance for release assets, SLSA Build L2 (L3 with reusable workflows); private repos use
  GitHub's Sigstore instance without a transparency log
  (https://docs.github.com/en/actions/concepts/security/artifact-attestations).
- **OCI artifacts.** ORAS pushes arbitrary artifacts to OCI registries, typed by
  `config.mediaType` (https://oras.land/docs/); Helm charts and RHDH dynamic plugins (`oci://…@sha256:…!plugin`)
  ride on this; signing with cosign/Notation and digest pinning come for free.
- **Terraform provider registry protocol** — the best-specified "registry as a protocol": discovery
  via the host's service-discovery document (`providers.v1`), `GET :ns/:type/versions` (each
  version lists supported **plugin protocol** major.minor and platforms), and
  `GET …/:version/download/:os/:arch` returning `download_url`, `shasum`, `shasums_url`,
  `shasums_signature_url` and `signing_keys` (GPG)
  (https://developer.hashicorp.com/terraform/internals/provider-registry-protocol). Anyone can host
  a registry under their own hostname; provider binaries run as go-plugin gRPC subprocesses
  **[protocol detail from general knowledge]**.
- **Deno** — URL/JSR imports with lockfile integrity and a runtime **permission model**
  (`--allow-net=host`, `--allow-read=path`) **[from general knowledge]**; Node ≥20 has a
  comparable experimental/stable `--permission` flag but it is process-wide, not per-module.
- **Module Federation 2.0** (module-federation.io) adds a manifest, a federation runtime and
  runtime plugins on top of webpack/Rspack MF; it lists "Router, Sandbox, SSR" as *future*
  high-level capabilities (https://module-federation.io/guide/start/index.html) — i.e. SSR of
  remote modules is not a solved, first-class feature.

---

## 18. Comparison table

| System | Client loading | Server isolation | Hot install (no restart) | Activation scope | Signing / trust | Registry |
|---|---|---|---|---|---|---|
| Grafana | Prebuilt `module.js`, lazy, SystemJS import map; host shares React/@grafana/* | Go backend = separate process (go-plugin gRPC), auto-restart on crash | Catalog: yes; CLI/zip: restart | Install server-wide; app config/enable per **org** | Mandatory signatures (private/community/commercial), MANIFEST hashes; unsigned refused | grafana.com catalog, semver `grafanaDependency` |
| Backstage / RHDH | Module Federation (Scalprum) remotes; host shares `@backstage/*` | In-process (Node) | Restart (no rebuild) | Per instance | sha512 `integrity` / OCI digest only | npm (private), **OCI images**, tgz URL |
| Directus | Server re-bundles all app extensions with rollup; Vue etc. external | In-process, or **isolated-vm** isolate w/ memory+timeout and scoped host functions | **Yes** — unload/load + bus broadcast to other nodes | Per project (enable/disable, bundle entries) | `MARKETPLACE_TRUST=sandbox` admits only sandboxed API code | npm mirrored into registry.directus.com |
| Strapi / Payload / Medusa | Compiled into the admin build (Payload: import map at build) | In-process | No — npm install + rebuild + restart | Per project | npm only; Strapi "verified" badge | npm + listing sites |
| WordPress | Enqueued script tags, prebuilt block JS | In-process PHP, none | Yes (per-request PHP) | Network or **per site** (multisite) | Review on submit; 2FA for committers; no package signing | wordpress.org SVN directory |
| VS Code | No code in renderer; declarative `contributes` + iframe webviews; web ext in Worker | Separate extension-host process (Node / Worker / remote); full permissions | Yes for most | Global or per workspace | Marketplace signing verified on install, verified publishers, malware scan, block list auto-uninstall | VS Marketplace, Open VSX |
| Figma | Iframe UI + main-thread Wasm JS VM, postMessage | n/a (client-only) | Yes | Per user / org | Review; manifest `networkAccess` CSP allow-list | Figma Community |
| Shopify | UI extensions in **Web Worker** + remote-dom → host web components; admin apps in iframe | App = separate service; Functions = **Wasm** | Yes (app versions released to all shops) | **Per shop** with OAuth scopes | App review, scope consent, versions + revert | Shopify App Store |
| Atlassian Forge | Custom UI iframes / UI Kit | Hosted Node functions, egress allow-list | Yes; permission escalation needs admin approval | **Per site** | Manifest scopes + egress; major versions gated per site | Atlassian Marketplace |
| Kibana / OSD | Prebuilt bundle per plugin | In-process | No (CLI restarts) | Per instance | None; exact-version pin | URL / zip |
| JupyterLab | Prebuilt **Module Federation** bundles, `sharedPackages` singleton/strictVersion | Python server ext in-process | Page reload (frontend); restart (server ext) | System / user overrides | None (pip/conda trust) | PyPI / conda |
| HA + HACS | ES-module dashboard resources | Python in-process | Frontend yes; integrations restart | Per instance | None; curated repo allow-list | **GitHub releases** |
| Obsidian | `main.js` in renderer, full access | n/a | Yes | Per vault | Restricted Mode, automated scan + scorecard | GitHub releases + directory |
| Discourse | Plugins compiled in; theme components loaded at runtime | In-process Ruby | Plugins: rebuild; **themes: yes, per site** | Plugins per container (+ site setting); themes per site | Review for official plugins | git repos |
| Mattermost | Bundle on page, PluginClass registers into slots | Go server part = subprocess (go-plugin) | **Yes**; filestore sync across cluster | Per server; install ≠ enable | Optional required signatures, custom public keys | Marketplace API |
| Nextcloud | App JS bundles | In-process PHP; ExApps in containers | Yes | Per instance, **limit to groups** | X.509 per-app certs, `signature.json`; signed apps can't go unsigned | apps.nextcloud.com |
| Terraform | n/a | go-plugin gRPC subprocess | n/a (per run) | Per configuration | GPG-signed SHA256SUMS, signing keys in registry response | **Registry protocol**, self-hostable |

---

## 19. Patterns that recur

1. **Manifest with a host-version range and declarative contributions.** Every mature system has a
   manifest naming the host range (`grafanaDependency`, `engines.vscode`, Directus `host`,
   `min_server_version`, `Requires at least`) and *declaring* what the plugin contributes (VS Code
   `contributes`, Grafana `includes`/`extensions`, RHDH `mountPoints`, Mattermost `settings_schema`).
   Declarations let the host index, enable/disable and render settings **without running plugin
   code**, and are what make lazy activation possible.
2. **Install ≠ activate.** Code arrives on disk once per server (operator action); activation and
   configuration are separate, scoped state (Grafana org, WordPress site, Mattermost enable,
   Forge site, Shopify shop, Nextcloud groups). Where per-tenant activation is real, the **host**
   enforces it at dispatch; where it is left to plugin code (Discourse `enabled_site_setting`), it
   leaks.
3. **Prebuilt bundles + host-provided singletons.** Nobody who supports runtime install rebuilds the
   host per plugin. Plugins ship compiled JS and import a short list of shared libraries the host
   provides — via an import map (Grafana/SystemJS), Module Federation `shared` (Backstage/RHDH,
   JupyterLab), bundler externals (Directus), or globals (Mattermost). Rebuild-the-host systems
   (Strapi, Payload, Kibana, Discourse plugins) cannot hot-install.
4. **Process boundary for server code whenever third parties are involved.** Grafana, Mattermost and
   Terraform use go-plugin subprocesses over gRPC; VS Code a separate extension host; Shopify/Forge
   run third-party code as separate services or Wasm; Nextcloud is moving to containers. In-process
   plugins (WordPress, Strapi, Backstage, Kibana) equal full trust.
5. **In-page JS sandboxes are fragile.** Figma's Realms shim was escaped and replaced with a Wasm
   interpreter; Grafana's frontend sandbox is deprecated; Directus replaced vm2 after an escape.
   The robust client boundaries are **iframes** (Figma UI, VS Code webviews, Forge, Shopify admin)
   and **workers rendering through a remote protocol** (Shopify remote-dom, VS Code web host). Both
   preclude sharing the host's React tree.
6. **Integrity first, then signatures, then publisher identity.** Hash pinning (RHDH `integrity`,
   OCI digests, Terraform `shasum`) is universal; signatures are checked at load (Grafana,
   Nextcloud, VS Code, Mattermost optional); and since 2024–25 the attack surface has moved to
   **publisher credentials** (WordPress password reuse, Open VSX leaked tokens, npm Shai-Hulud),
   answered with 2FA, short-lived tokens and OIDC trusted publishing with provenance.
7. **Permission escalation is a versioning event.** Forge makes added scopes a major version that
   each tenant admin approves; Directus/Figma/Forge declare egress allow-lists; Grafana issues
   plugins a scoped service account. Declared permissions are only meaningful where the host can
   enforce them (isolate, separate process, CSP).
8. **Hot reload = rebuild the registry, not unload the module.** Directus's `reload()` unloads all
   extension registrations and loads them again from version-specific folders, then broadcasts to
   other nodes; Mattermost syncs bundles through the shared file store. Node never truly frees the
   old ESM module — versioned paths make the new one load fresh.
9. **Registries are thin.** Directus mirrors npm by keyword; HACS and Obsidian index GitHub
   releases; RHDH uses OCI; Terraform defines a 2-endpoint protocol anyone can host. The hard parts
   are review, signing and revocation, not storage.

---

## 20. Lessons for DMS

DMS's shape — React 19 SSR client, Node/Express + Falcor server, Postgres, a task queue with
separate worker processes, many tenants on one server — sits between **Directus** (Node,
hot-install, server-side bundling), **Grafana/Mattermost** (install server-wide, enable per
org; prebuilt frontend with shared singletons) and **WordPress multisite / Discourse multisite**
(one code base, per-site activation). Recommendations, in priority order:

1. **Use the npm tarball as the package format, with a `dms` key in `package.json`** (like
   `directus:extension`): `name`, `version`, `dms.host` (semver range on a *DMS plugin API*
   version, not the app version), and declarative `dms.contributes` → `themes[]`,
   `patterns[]` (route sets, page-section components), `dataTypes[]` (Falcor route modules, task
   handlers, schedules, admin pages), plus `dms.permissions` (DB schemas it may create, egress
   hosts, task types). One package carries `dist/client/` (browser ESM), `dist/ssr/` (Node ESM for
   SSR) and `dist/server/` (routes/workers). Reusing npm format gets `npm pack`, Verdaccio,
   provenance and GitHub-release hosting for free; a URL install is just "fetch a `.tgz`, check its
   sha512".
2. **Ship prebuilt output only; never run `npm install` or lifecycle scripts on the server.**
   Follow RHDH's derived-package split: host-shared libraries (`react`, `react-dom`,
   `react-router`, `@availabs/dms`, Falcor client) are `peerDependencies` resolved to the host's
   single copy; everything else is bundled into `dist/`. Shai-Hulud spread through install scripts.
3. **Client loading: native ESM + an import map for shared singletons, not Module Federation, for
   v1.** Vite emits ESM; plugins built as libraries with the shared list as externals can be loaded
   with `import()` from `/plugins/<name>@<version>/client/*.js`, with the browser import map (and
   the SSR resolver) pointing `react` etc. at the host's copies — Grafana's SystemJS model, minus
   SystemJS. Module Federation (Backstage, JupyterLab) solves the same problem with version
   negotiation, but MF 2.0 itself lists SSR as future work, and DMS needs SSR. Note for RSC:
   Payload shows RSC plugin components are resolved **at build time** (import map regenerated only
   at startup/build); keep plugin UI as **client components** loaded at runtime until DMS's RSC
   story settles. **[Inference — not from a source.]**
4. **SSR resolution on the server.** Install each version to a content-addressed directory
   (`plugins/<name>/<version>/`, like Directus `.registry/<versionId>`), import its `dist/ssr`
   entry with `import()`, and make bare `react`/`@availabs/dms` imports resolve to the host's copy
   (install dir nested under the app so Node resolution walks up, or `module.register()` resolve
   hooks). Two Reacts on the server breaks hooks exactly as in the browser.
5. **Hot install = rebuild registries atomically; accept that old module versions stay resident
   until the next restart.** Keep host registries (themes, pattern types, section components, Falcor
   routes, task handlers, schedules) as data structures rebuilt from the installed+enabled set,
   behind a single-concurrency reload queue (Directus `reloadQueue`), swapped atomically, and
   broadcast over Postgres `LISTEN/NOTIFY` (DMS's equivalent of Directus's bus) if there is more
   than one server process. The Falcor router should dispatch through an indirection layer so routes
   can be replaced without restarting Express. Rollback = re-point to the previous version directory.
6. **Install server-wide, activate per tenant — enforced by the host, not the plugin.** Grafana's
   split (operator installs; tenant admin enables/configures) and WordPress multisite's per-site
   activation are the models; Discourse is the warning: if a tenant's activation is just a flag the
   plugin checks, deactivation does not undo anything. DMS should filter every registry lookup by the
   requesting tenant's active-plugin set (pattern types offered in the editor, theme list, Falcor
   routes for that app, task types it may enqueue). Store activation + per-tenant config (validated
   against a manifest settings schema, as Mattermost `settings_schema`) in Postgres.
7. **Use the boundaries DMS already has for server isolation.** Data-type ETL already runs in task
   workers — run plugin task handlers *only* in worker processes (fresh process per job or per
   plugin version), never inside the web process; this gives crash isolation and clean upgrades
   (new jobs pick up the new version) like go-plugin, without a new RPC layer. Falcor routes must run
   in-process, so in-process code means **trusted** code. A sandbox tier (isolated-vm with memory and
   timeout limits and capability-scoped host functions, à la Directus) is the option if
   untrusted per-tenant server logic is ever needed; vm2-style sandboxes are not.
8. **Do not attempt an in-page sandbox for plugin React components.** Grafana deprecated theirs,
   Figma's was escaped. If untrusted UI is ever needed, the proven options are an iframe or a worker +
   remote-DOM renderer (Shopify) — both give up shared React context and SSR. So v1 should be a
   **trusted-publisher** model.
9. **Themes can be a lower-trust tier.** A theme that is only class-string data can be installed and
   activated per tenant with little risk — Discourse's runtime theme components are the precedent;
   theme *components* (JS) fall under the code-trust rules. Splitting the theme contribution into
   `data` and `components` lets a tenant self-serve the first.
10. **Integrity and signing from day one; registry later.** Require a sha512 `integrity` (or OCI
    digest) for every install source (RHDH); verify a signature over the tarball (Grafana/Nextcloud
    model; Sigstore/npm provenance or GitHub artifact attestations avoid running a PKI); keep a
    block list that can disable a version fleet-wide (VS Code). For the registry, a Terraform-style
    two-endpoint protocol (`versions`, `download` → url + sha + signature) or a Verdaccio instance
    with keyword filtering (Directus) is enough; publish from CI with OIDC, never long-lived tokens.
11. **Tie permission escalation to versions.** Declare permissions in the manifest and make a version
    that adds permissions require per-tenant re-approval (Forge), so auto-update can't silently widen
    access.
12. **Keep the plugin API narrow and versioned.** Kibana's exact-version pin follows from exposing
    the whole internal API; Grafana and VS Code can use semver ranges because the plugin talks to a
    defined SDK. DMS should version a plugin API (`@availabs/dms/plugin-api`) separately from the
    app.

---

### Verification notes

- Verified against primary sources during this pass: everything with an inline URL, plus Directus
  `isolated-vm` use and reload/bus behaviour (read from `api/src/extensions/manager.ts` and
  `lib/installation/manager.ts` on `main`), and go-plugin dependencies in Mattermost
  `server/public/go.mod` and `grafana-plugin-sdk-go/go.mod` (v1.8.0).
- **Unverified / from general knowledge** (marked inline): Grafana MANIFEST.txt detail; Keystone;
  Strapi rebuild wording (secondary sources); WordPress auto-update 5.5 date and multisite activation
  UI; VS Code no-reload install; Figma org management; Shopify iframe/App Bridge and Function
  limits; OpenSearch Dashboards; HA frontend resources; Nextcloud group limiting; Verdaccio; Deno;
  Terraform go-plugin; npm post-Shai-Hulud rollout status; the 2026 Wordfence WordPress incidents
  (headlines only).
