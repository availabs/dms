# Task: Translate the TransportNY login page via the `auth` pattern theme + write a new login skill

**Topic:** patterns/auth + themes (transportny) + **skills (new)**
**Status:** ✅ DONE 2026-06-03 — theme-only pass + key-gated component structure +
inline-forgot relocation all shipped & verified live; new skill written + indexed.

## Phase A — theme-only pass (2026-06-03) — DONE
**Decisions (user, via AskUserQuestion):** scope = **theme-only, defer structure**;
surface = **`authPages.*` only** (retire the dead `auth.login`/`auth.signup` draft).

**Shipped** (`src/themes/transportny/themev2.js`, transportny theme only):
- Replaced the dead `auth.login`/`auth.signup` block with
  `auth.authPages.sectionGroup.default.*` — the surface `authLogin.jsx:18` actually
  reads (`pageWrapper`, `pageTitle`, `forgotPasswordText`, `actionButton`, `actionText`,
  `prompt`, + `wrapper3: w-full`, `wrapper4: hidden`).
- `layoutGroup` `auth` style made **borderless + centered** (was a white card that
  double-carded with `pageWrapper`).
- Added `field.fieldWrapper` (global) to kill the default `<fieldset>` groove border
  and stack fields `gap-4`. Brand `field`/`input`/`button` already matched the mockup.
- `actionButton` carries the full navy `border-b-4` press button (Button does
  `className || theme.button`, so the passed className **replaces** the `plain` style).

**Verified live** at `http://npmrds.localhost:5173/auth/login` via `card-shot.mjs`
(`scratchpad/npmrdsv5-dev2/transcribe/loginform.compare.png`): pane, big display title,
uppercase labels, white rounded inputs, full-width navy press button, navy forgot link,
mono-uppercase prompt all match the mockup's themeable surface.

**Key gotchas (now captured in the skill):**
1. **The form rendered the auth *base defaults* until the auth pattern's
   `selectedTheme` was pointed at `transportnyv2`.** `src/themes/index.js` registers
   both `transportny` (old `theme.js`, no auth block) and `transportnyv2` (`themev2.js`).
   Pattern 1498261 now `selectedTheme: transportnyv2`. (User set this — "I set it for you".)
2. The component reads `auth.authPages.sectionGroup.default.*`, **not** the drafted
   `auth.login.*` (which was wired to nothing).
3. Inputs/labels come from the **global** `field`/`input` themes, not `auth.*`.
4. The compact sidenav rail is **pattern layout config**, not the page/theme.

## Phase B — component structure (key-gated, BC) — DONE
Per user (2026-06-03): added the mockup's extra elements to `authLogin.jsx` as
**theme-key-gated** blocks — each renders only when its `authPages.sectionGroup.default.*`
key is set, so themes that don't set them (every other site) render byte-identical (BC).
Shipped slots: brand line (`brandWrapper`/`brandMark*`/`brandName*`), title block
(`headingText`+`kicker*`+`headingAccent*`+`subtitle*`, falls back to plain `pageTitle`),
"or" `divider` + SSO button (`ssoButton`/`ssoMark*`), trailing `utilityLinks` row. All
set in transportny except SSO/divider, which are **left commented** in the theme (no
NY.gov provider yet — one uncomment to re-enable; SSO click shows a "not available"
notice).

## Phase C — inline forgot relocation (FieldSet affordance) — DONE
Per user (tab-order): moved the forgot link from below the FieldSet onto the **password
label row** (right-aligned). Added an optional `labelAccessory` node prop to
`UI.FieldSet` (`FieldSet.jsx` FieldComp renders it in a `field.labelRow` flex row;
stripped from the `<input>` props). `labelAccessory` is BC for FieldSet (renders only
when supplied); `authLogin.jsx` always supplies it for the password field, so the forgot
link relocated for **every** theme — an intentional non-BC nicety (user OK'd non-BC).
Added `field.labelRow` default (`FieldSet.theme.js`) + transportny override.

### Files changed
- `src/themes/transportny/themev2.js` — `auth.authPages.sectionGroup.default.*` (full
  set, SSO/divider commented), `layoutGroup` `auth` style (borderless/centered),
  `field.fieldWrapper` + `field.labelRow`.
- `patterns/auth/pages/authLogin.jsx` — key-gated brand/title/divider/SSO/utility slots;
  inline forgot via `labelAccessory`; removed standalone forgot link.
- `ui/components/FieldSet.jsx` + `FieldSet.theme.js` — `labelAccessory` prop + `labelRow`.
- Skill `skills/implementing-an-auth-login-page.md` (new, indexed); gotcha folded into
  `skills/translating-design-system-to-dms-theme.md`.

### Known small gaps (acceptable / optional)
- Live still shows the "Don't have an account? Sign up" prompt the mockup omits (BC
  signup prompt; can hide per-site via `disable_signup`).
- SSO intentionally disabled (no provider).
**Goal:** style the auth pattern's login page to the mockup **through the theme**, and —
because we have no skill for this yet — **write a brand-new reusable skill** so the *next*
design system's login page is one-shot.

## Objective

Make the `npmrds_auth` login page render like
`…/dms_design_system_v2/pages/login.html`, by overriding the **auth pattern theme** (not by
building sections, and not by forking the auth component unless explicitly approved).

- **Pattern:** `dev2|npmrds_auth:pattern` (id **1498261**) — the auth pattern. The login page
  is a **fixed React component** (`patterns/auth/pages/authLogin.jsx`), **styled via theme** —
  it is *not* assembled from sections like a content page.
- **Two theme surfaces to reconcile (Phase 1 — the crux):**
  1. **transportny `auth.login`** — `themev2.js:1615`, already drafted to the mockup:
     `wrapper` (rounded card, max-w-md, shadow), `title`, `fieldStack`, `submitButton`,
     `divider`, `ssoButton` (+ a `signup` sibling).
  2. **auth pattern defaults** — `patterns/auth/defaultTheme.js`: `authPages` +
     `authPages.sectionGroup.default.*` (`pageWrapper`, `pageTitle`, `forgotPasswordText`,
     `actionButton`, `actionText`, `prompt`, the compact `sideNavContainer*` rail) and
     `field.*` (input field styling).
  **Determine which surface `authLogin.jsx` actually reads** before styling — the transportny
  `auth.login` block may not be wired to the component yet. Reconcile so one surface drives the
  page (prefer the brand `auth.*` keys; back-compat the old `authPages.*` if the component reads them).
- **Host / verify:** the login page is at `/auth/login` (see `transcribing-a-design-card-to-dms.md`).
  Dev creds `availabs@gmail.com` / `test123`.

## Why this is simpler than the content pages — and the one risk
The auth flow itself is outside page-layout (it's a fixed component + a `POST /login`), so the
work is almost entirely **theme translation** — much smaller surface than a content page. The
one risk: if the mockup's login **structure** diverges from what `authLogin.jsx` renders
(extra fields, an SSO provider button, split-screen hero), the theme can't express it and you'd
be editing the **component** — which triggers the "ask first" rule below.

## ▶ Before doing anything — REQUIRED skill use

**Invoke these skills (Skill tool) BEFORE editing the theme:**

1. **`translating-design-system-to-dms-theme.md`** — the primary skill. It already maps
   `auth.login` / `auth.signup` → `patterns/auth/defaultTheme.js` (see its theme-key index
   ~line 1366 and the `auth` example ~1914). The whole design-tokens → theme-keys method.
2. **`designing-a-dms-design-system.md`** — context for the `auth.login` / `auth.signup`
   surfaces and how auth pages sit in the design system.
3. **`transcribing-a-design-card-to-dms.md`** — the **Playwright loop** to compare the live
   `/auth/login` against the mockup (`card-shot.mjs`; auth note: signed-out is fine — you're
   shooting the login screen itself). Token/creds as documented there.

## Mockup mapping (`login.html`)
Centered auth card (`max-w-[400px]`) on `#ECEEF2`, beside a **compact 64-px icon sidenav rail**
(signed-out variant): brand mark; `h1` "Welcome back" with an amber period; **Email** + **Password**
labeled inputs (rounded, focus ring `#1F3F8F`); a navy **"Sign in"** submit button with the
`border-b-4` press effect; an **"or"** divider; an **SSO** button. Map each to an `auth.login`
(or `authPages.*`) theme key; the inputs map to `field.*` / the shared `UI.Input` theme; the
64-px rail maps to the auth `sectionGroup.default.sideNavContainer*` keys.

## 🔶 RULE — Ask before adding a new system primitive / editing the component
Theme overrides are in-scope. **But if the mockup needs something the theme can't express —
a structural change to `authLogin.jsx` (new field, SSO provider, layout split), a new shared
`UI.Input`/`UI.Button` variant, or any new primitive — STOP and ASK the user first.** Per
`CLAUDE.md` (author-empowerment) + the feedback memory *"Primitive changes need a planning
task, BC by default, ask before non-BC"*: editing the auth **component** or a **shared UI
primitive** is exactly the kind of change that gets its own task, stays BC by default, and has
non-BC options surfaced as an explicit question — not chosen unilaterally. Also: the auth theme
is **shared** — scope edits to the **transportny** theme only; don't touch other sites' auth themes.

## 🔶 RULE — Write a NEW reusable skill (primary deliverable)
We have **no skill** for implementing a login/auth page from a design system — every existing
skill is for content pages or themes generally. **Create one:**

- **New skill: `skills/implementing-an-auth-login-page.md`** — generalize this work so the next
  design system's login page is one-shot. It should cover, design-system-agnostic:
  - Login is the **auth pattern** = a fixed component styled via theme, **not** a CLI section build.
  - The **theme surfaces** (`auth.login`/`auth.signup` in the site theme ↔ `patterns/auth/defaultTheme.js`
    `authPages.*` / `field.*` / `sectionGroup.default.*`), how to find **which one the component
    reads**, and the auth `sideNavContainer*` rail.
  - The mockup→theme-key mapping recipe (card wrapper, title, field stack, inputs via `field.*`/
    `UI.Input`, submit `UI.Button`/`submitButton`, divider, SSO button, forgot-password, prompt).
  - The **Playwright verify** loop against `/auth/login`.
  - The **boundary**: theme can restyle; structural changes mean a component task → ask first.
  - A worked example pointing at this TransportNY pass.
- **Index it** in `skills/README.md`.
- Also fold any theme-key gaps you hit back into `translating-design-system-to-dms-theme.md`.

### Skill notes (accumulate here)
- _(none yet)_

## Build approach (phased)
1. **Reconcile theme surfaces** — which keys `authLogin.jsx` reads; pick the driving surface (BC).
2. **Style to the mockup** — card, title, inputs (`field.*`/`UI.Input`), navy press button, divider,
   SSO, 64-px rail — transportny theme only.
3. **Verify** via `card-shot` against `/auth/login`.
4. **Write the new skill** + index it; roll theme-key gaps into `translating-design-system-to-dms-theme.md`.

## Testing checklist
- [x] Determined which theme surface `authLogin.jsx` consumes (`auth.authPages.sectionGroup.default.*`); one surface drives the page.
- [x] Live `/auth/login` matches the mockup (borderless pane, brand, kicker+headline+subtitle, inputs + focus ring, inline forgot, navy `border-b-4` button, utility row) — `card-shot` vs mockup (`scratchpad/npmrdsv5-dev2/transcribe/loginform4.*`). SSO/divider intentionally disabled.
- [x] Component change made **with explicit user approval** (key-gated, BC for other sites; forgot relocation a user-OK'd non-BC nicety).
- [x] Theme edits scoped to transportny; the shared-component additions are key-gated so other sites' auth pages render unchanged (except the user-approved forgot relocation).
- [x] **New skill `implementing-an-auth-login-page.md` written + indexed in `skills/README.md`.**
- [x] Theme-key gaps rolled into `translating-design-system-to-dms-theme.md`.
- [ ] _(follow-up, optional)_ Re-enable SSO once a NY.gov provider exists; hide the signup prompt for transportny if desired.
