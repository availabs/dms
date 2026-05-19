# Email Redesign

## Status: COMPLETE

See research doc: `planning/research/email-design.md`

## Objective

Redesign transactional auth emails to match the active site theme (logo + colors) and wire up the email sending in server handlers.

**Approach:** Client (auth pages) extracts `emailTheme` object from `ThemeContext` and passes it in the POST body. Server uses it to render themed HTML — no server-side theme awareness needed.

## Scope

**Shipped:**
- `buildEmailHtml` with logo + themed colors (table-based inline CSS, email-client safe)
- Welcome email (signup), temp password email (forgot password), confirmation email (change password)
- `emailTheme` defaults in auth `defaultTheme.js`; site themes can override via `auth.emailTheme`
- Logo from `theme.logo.img` with relative-URL resolution via `siteOrigin`

**Out of scope (separate tasks):**
- Email verification (`signupRequest` / `verifyEmail`) — needs token-link pattern
- Invite flow (`sendInvite`) — same
- Signup accept/reject notifications — admin-facing

## Files changed

| File | Change |
|------|--------|
| `packages/dms/src/patterns/auth/defaultTheme.js` | Added top-level `emailTheme` with default hex values |
| `packages/dms/src/patterns/auth/pages/authSignup.jsx` | Builds + passes `emailTheme` in request |
| `packages/dms/src/patterns/auth/pages/authForgotPassword.jsx` | Builds + passes `emailTheme` in request |
| `packages/dms/src/patterns/auth/pages/authResetPassword.jsx` | Builds + passes `emailTheme` in request |
| `packages/dms-server/src/auth/utils/email.js` | New `buildEmailHtml(opts)` — logo + themed HTML; old exports kept as backward-compat wrappers |
| `packages/dms-server/src/auth/handlers/auth.js` | Added `emailTheme` param to 3 handlers; wired up all 3 email send calls |

## `emailTheme` shape

```js
{
  primaryColor, accentColor, textColor, backgroundColor,  // hex strings from theme
  logoUrl,    // theme.logo.img (empty string if unset)
  logoTitle,  // theme.logo.title || PROJECT_NAME
  siteOrigin, // window.location.origin (for resolving relative logo URLs)
}
```

## How to add email colors to a site theme

In any site's auth theme override, add:

```js
// e.g. src/themes/mny/auth.js or equivalent
emailTheme: {
  primaryColor:    '#2D3E4C',
  accentColor:     '#EAAD43',
  textColor:       '#37576B',
  backgroundColor: '#F4F4F4',
}
// logoUrl / logoTitle / siteOrigin are always injected by the auth pages at send time
```

## Testing checklist

- [ ] SMTP env vars configured locally (`SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`)
- [ ] Signup with auto-generated password → welcome email with password in body
- [ ] Signup with user-provided password → welcome email without password
- [ ] Forgot password → temp password email with Sign In button
- [ ] Reset password (while logged in) → password-changed confirmation email
- [ ] All emails render correctly in Gmail (tables, inline CSS, logo loads)
- [ ] Relative logo URL (`/themes/foo/logo.svg`) → absolute URL in email
- [ ] Site with no logo configured → `logoTitle` text shown in header
- [ ] SMTP unconfigured → all flows succeed silently (no error thrown)
