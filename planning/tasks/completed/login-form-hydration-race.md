# Sign-in form: text typed before the page hydrates is lost

**Initiatives:** [dms_page_load_performance](../../../../../planning/initiatives/dms_page_load_performance.md) · **Status:** done (2026-11-27, owner: committed and deployed) · **Created by:** amuro@albany.edu · **Edited by:** amuro@albany.edu

## Objective

On a server-rendered sign-in page (`patterns/auth/pages/authLogin.jsx`), a visitor who types before the
JavaScript has hydrated the form gets "Email, password, and project are required" back. Found 2026-11-21:
`dms perf`'s signed-in runs failed from it, and a fast typist after a slow load hits it the same way.

## Cause

The inputs are controlled (`credentials` state). Text typed before hydration is in the DOM but not in state;
sign-in sends the empty state, and the first re-render after hydration wipes the fields. Pressing Enter
before hydration submitted the form natively (a GET to the same URL, i.e. a reload).

## The fix (built)

- On hydration, an effect copies whatever the fields hold into state.
- The inputs have `name` (`email`, `password`) and `autoComplete` (`username`, `current-password`).
- Sign in is `disabled` until hydrated, on the server and the first client render (so they match); a
  disabled default button also stops Enter from submitting natively.

## Testing

- [x] Hub, build `rscsi1`: fields filled before hydration (button disabled then); Enter before hydration
      stays on `/auth/login`; after hydration both fields keep their text; sign in works (`loginrace.mjs` in
      the session scratchpad)
- [x] `dms perf` signed-in runs and `parity/session.mjs` sign in through the form (rsc-view-pages.md S9)
- [ ] The other auth forms (sign-up, forgot / reset password) have the same shape but are not `<form>`s with a
      submit button; check them if they're ever server-rendered for cold visits
