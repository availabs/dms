# Implementing an auth login (sign-in) page from a design system

**Outcome:** make a brand's `/auth/login` (and `/auth/signup`) render like the design
system's `login.html`, **through the theme** — no section-building, no component fork.

Login is **not a content page.** There are no sections to assemble. It's the **auth
pattern**: a *fixed React component* (`patterns/auth/pages/authLogin.jsx`) styled
entirely via theme keys. Your whole job is theme translation onto the keys that
component actually reads. This is a much smaller surface than a content page — and the
one trap is that the mockup may contain structure the fixed component doesn't render
(see step 5).

Read [`translating-design-system-to-dms-theme.md`](./translating-design-system-to-dms-theme.md)
first for the tokens→theme-keys method; this skill is the auth-specific specialization.

---

## TL;DR recipe

1. **Find the surface the component reads.** Open `patterns/auth/pages/authLogin.jsx`.
   It reads `theme.auth.authPages.sectionGroup.default.*` (+ inputs via `UI.FieldSet`/
   `UI.Input`, submit via `UI.Button`). **That** is the surface to style — not any
   `auth.login.*` block someone drafted (those are often wired to nothing; verify).
2. **Confirm the pattern actually uses your brand theme.** Set the auth pattern's
   `selectedTheme` to your brand theme key. If it's unset, the page renders the auth
   pattern's **base defaults** no matter what you put in the theme file (step 6 — the
   gotcha that eats the most time).
3. **Override the keys in your site theme** under `auth.authPages.sectionGroup.default`
   (deep-merges over `patterns/auth/defaultTheme.js`). Style the pane, title, button,
   forgot link, prompt. Inputs/labels come from the global `field`/`input` themes.
4. **Verify live** with `scripts/card-shot.mjs` against `/auth/login` (signed-out is
   fine — you're shooting the login screen itself).
5. **Boundary:** if the mockup needs structure the component doesn't render (brand
   line, kicker/subtitle, "or" divider, SSO button, utility row), the theme **can't**
   add it. Stop and file a component task — don't fork the shared component unasked.

---

## 1. The two theme surfaces — and which one wins

Two places define auth styling; only one drives the page:

- **`patterns/auth/defaultTheme.js`** → merged into the global theme as
  `theme.auth.*`. Defines `authPages.sectionGroup.default.*`
  (`pageWrapper`, `pageTitle`, `forgotPasswordText`, `actionButton`, `actionText`,
  `prompt`, plus the `sideNavContainer*` / `wrapper3` / `wrapper4` layout slots) and a
  global-looking `field.*` block.
- **Your site theme** (e.g. `src/themes/<brand>/themev2.js`) → an `auth` key that
  **deep-merges over** the pattern default.

**`authLogin.jsx` reads `theme?.auth?.authPages?.sectionGroup?.default`** — so your
brand `auth` key must put its overrides at exactly that path:

```js
// src/themes/<brand>/themev2.js
const auth = {
  authPages: {
    sectionGroup: {
      default: {
        // AuthLayout wrappers (siteConfig.jsx AuthLayout): wrapper3 wraps the form
        // column; wrapper4 is a hero-image panel. Hide wrapper4 if the mockup has none.
        wrapper3: "w-full",
        wrapper4: "hidden",
        // The form content the component emits:
        pageWrapper:        "...",   // the form's flex container
        pageTitle:          "...",   // the (single) title string the component hardcodes
        forgotPasswordText: "...",   // forgot link AND the signup-prompt link
        actionButton:       "...",   // submit <Button> — see step 4
        actionText:         "...",   // <span> inside the submit button
        prompt:             "...",   // "Don't have an account? Sign up" row
      },
    },
  },
};
// ...later: const brandTheme = { /* ... */ auth, /* ... */ };
```

> **Retire dead draft keys.** If the theme has an `auth.login` / `auth.signup` block
> with keys like `wrapper`/`title`/`fieldStack`/`divider`/`ssoButton`, check whether
> *anything* reads them (`grep "auth?.login"`). If not, they're a decoy — the component
> reads `authPages.*`. Fold their design into `authPages.sectionGroup.default.*` and
> delete the dead block, so one surface drives the page.

`authSignup.jsx` reads the **same** surface, so these overrides style signup too —
verify both pages, and keep them consistent.

## 2. Inputs and labels come from the GLOBAL theme, not `auth`

- `UI.FieldSet` (the email/password stack) reads `getComponentTheme(theme, 'field')` →
  **`theme.field`** (top-level), styling the `<fieldset>` (`fieldWrapper`), each row
  (`field`) and `label`. *Note:* a bare `<fieldset>` with no `fieldWrapper` falls back
  to the browser-default groove border — set `field.fieldWrapper`.
- `UI.Input` reads **`theme.input`** (flat — no `styles`/`activeStyle`).

These are **site-wide**: overriding them restyles every form on the site, not just
login. That's usually fine (it's your brand input/label), but it's not login-scoped —
if the brand already defines `field`/`input`, the login inputs are probably already
right and you only touch `auth.authPages.*`.

## 3. The submit button: `className` REPLACES the style

`authLogin.jsx` renders `<Button type='plain' className={actionButton}>`. `UI.Button`
does `buttonClass = className || theme.button` — so a passed `className` **replaces**
the selected style entirely. Put the *full* button styling in `actionButton` (don't
expect the `plain` style to contribute). Easiest: copy your brand's primary button
class and add `w-full`:

```js
actionButton: "<your primary button classes> w-full justify-center",
actionText:   "<text classes matching the button>",
```

## 4. The page frame: AuthLayout + the LayoutGroup `auth` style

`patterns/auth/siteConfig.jsx` `AuthLayout` renders
`<Layout activeStyle='auth'><LayoutGroup activeStyle='auth'> [wrapper3 form] [wrapper4 hero] </LayoutGroup></Layout>`.
So three frames stack around the form:

1. **LayoutGroup `auth` style** (`theme.layoutGroup` styles → `name: "auth"`):
   `wrapper1` = the full pane (set the page bg, center the form), `wrapper2` = the
   inner column (set `max-w-[...]`). **If this is a white card AND `pageWrapper` is
   also a card, you get a double-card** — pick one. For a borderless "form on the
   pane" mockup, make `wrapper2` a plain centered container.
2. **`authPages.sectionGroup.default.wrapper3`** wraps the form (`w-full` pass-through),
   **`wrapper4`** is a hero-image side panel — `hidden` if the mockup has none.
3. **`pageWrapper`** is the form's own flex stack.

## 5. The 64-px / compact sidenav rail is PATTERN config, not theme

The auth mockup's icon rail is the `Layout` sidenav, configured on the **pattern**
(`pattern.theme.layout.options.sideNav` — e.g. `size: "compact"`, `topMenu: [{type:'Logo'}]`),
**not** in your page/theme overrides. That's why the rail/logo can look on-brand while
the *form* still renders base defaults. Don't try to style the rail through the auth
keys; adjust it on the pattern (admin → pattern layout options).

## 6. Verify — and the #1 gotcha

```bash
node scripts/card-shot.mjs \
  --name login \
  --mockup "src/themes/<brand>/.../pages/login.html" --mockup-sel '[data-dms-section="login-form"]' \
  --live   "http://<sub>.localhost:5173/auth/login"  --live-sel '.flex.flex-col.gap-5' \
  --out scratchpad/<env>/transcribe
```

**If the live form renders the auth *base defaults* (generic title/inputs/button) even
though your theme file is correct:** the auth **pattern isn't using your theme**. Two
causes, in order of likelihood:

1. **`selectedTheme` not set** on the auth pattern → it resolves to the base/default
   theme. Set the pattern's theme to your brand theme (admin theme picker, or
   `pattern.theme.selectedTheme`). Confirm with the CLI:
   `dms raw get <patternId> --app <app>` → `data.theme.selectedTheme`.
2. The brand theme key in `src/themes/index.js` differs from what you edited (e.g. a
   site can register both `transportny` *and* `transportnyv2` — make sure
   `selectedTheme` names the file you changed). Confirm Vite serves your edit:
   `curl .../src/themes/<brand>/themev2.js | grep '<a unique class you added>'`.

Tell base-defaults from "theme applied but Tailwind didn't compile a class" by reading
the live element's actual `class` attribute in the browser: if it's the
`patterns/auth/defaultTheme.js` string, it's cause (1)/(2); if it's *your* class string
but renders wrong, it's a Tailwind/JIT issue.

## 7. Extra structure — the key-gated slots (and the boundary)

`authLogin.jsx` base form emits: `pageWrapper > (title) + FieldSet(email,password) +
forgot link + error + submit button + signup prompt`. The mockup often adds a brand
line, a kicker/eyebrow, a headline + subtitle, an "or" divider, an SSO button, or a
trailing utility row. **A theme can't create DOM nodes** — so these are rendered by the
component, **gated on theme keys**, and are backward-compatible: a theme that omits the
key renders nothing extra (every existing site is byte-identical). Set these on
`auth.authPages.sectionGroup.default` to opt in:

| Slot | Keys (className unless noted) | Renders when |
|---|---|---|
| Brand line | `brandWrapper`, `brandMark` + `brandMarkText` (text), `brandName` + `brandNameText` (text) | `brandWrapper` set |
| Title block | `headingBlock`, `kicker` + `kickerText`, `heading` + `headingText`, `headingAccent` + `headingAccentText`, `subtitle` + `subtitleText` | `headingText` set (else falls back to plain `pageTitle`) |
| "or" divider | `divider` (use `before:`/`after:` for the flanking rules) + `dividerText` (default "or") | `divider` set |
| SSO button | `ssoButton`, `ssoMark` + `ssoMarkText`, `ssoButtonText` | `ssoButton` set |
| Utility row | `utilityWrapper`, `utilityLink`, `utilityLinks: [{text, to}]` (array) | `utilityLinks` non-empty |

The **forgot link sits inline on the password label row** (right-aligned), via
`UI.FieldSet`'s optional per-field `labelAccessory` node (rendered in a `field.labelRow`
flex row — `flex items-center justify-between`). This is better tab order than a link
between the password field and Sign In. `labelAccessory` is a BC FieldSet addition
(renders only when a field supplies it); `authLogin.jsx` always supplies it for the
password field, so the forgot link moved for every theme (an intentional non-BC nicety).

> **SSO has no provider by default** — the button click surfaces a "not available yet"
> notice. Don't enable it for a brand until there's a real SSO backend (or decide,
> with the user, that a visual-only placeholder is acceptable).

**Still over the line:** anything these slots don't cover — a split-screen hero, new
auth flows, more form fields. Adding a *new* slot is itself a shared-component change: per
`CLAUDE.md` (author-empowerment) + *"primitive changes need a task, BC by default, ask
before non-BC"*, file a task, keep it key-gated/BC, and **ask first**. Don't fork the
auth component to chase pixel parity unprompted.

## Worked example — TransportNY (2026-06-03)

`login-page-translate.md`: styled `npmrds_auth` (pattern 1498261, `selectedTheme:
transportnyv2`) to `dms_design_system_v2/pages/login.html`, **theme-only**:

- Retired the dead `auth.login`/`auth.signup` draft block in `transportny/themev2.js`;
  added `auth.authPages.sectionGroup.default.*` (the surface the component reads).
- Made the `layoutGroup` `auth` style borderless + centered (it was a white card that
  double-carded with `pageWrapper`); `wrapper4: hidden` (no hero panel in the mockup).
- Reused the brand primary-button classes for `actionButton` (full-width navy
  `border-b-4` press); brand `field`/`input` already matched the mockup inputs/labels;
  added `field.fieldWrapper` to kill the default `<fieldset>` border.
- **Gotcha that ate the most time:** the form rendered base defaults until the auth
  pattern's `selectedTheme` was pointed at `transportnyv2` (step 6, cause 1).
- **Then extended the component (key-gated, BC)** to render the rest of the mockup:
  added the brand line / kicker+headline+subtitle / divider / SSO / utility-row slots
  in `authLogin.jsx` (step 7), each gated on its theme key, and set those keys on
  transportny — full mockup fidelity with no change to any other site's login page.
  Also relocated the forgot link inline onto the password label row via a new BC
  `FieldSet` `labelAccessory` prop (better tab order). SSO is disabled for now (no
  NY.gov provider) — the `divider`/`ssoButton` keys are left commented in the theme,
  one uncomment from re-enabling.
