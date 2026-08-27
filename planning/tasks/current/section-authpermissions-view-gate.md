# Sections: authPermissions now gate VIEW visibility

## Status: DONE 2026-08-27 (one guard in SectionView, BC)

## Objective
Sections have long CARRIED `authPermissions` (JSON string on the section row,
authored via the section menu's Permissions UI) — but they only gated EDITING
(`canEditSection`). Designs want auth-gated content blocks (e.g. staff-only
CTA buttons living in their own sections, per the MNY dashboard mockup's
`data-auth="signed-in"` block).

## Change (BC)
`SectionView` hides the section (renders null) when it carries non-empty
authPermissions AND the viewer fails `isUserAuthed(['view'], sectionAuthPermissions)`.
- Sections WITHOUT authPermissions render exactly as before.
- Page-EDIT mode always shows the section, so authors can keep managing it.
- Semantics follow `utils/auth.js` `isUserAuthed`: `{groups:{public:[]}}` =
  signed-in only (the explicit empty public grant blocks anonymous; any authed
  user passes the "authed + no other grants configured" allowance); specific
  group/user grants narrow further.

## Motivating use
MNY Actions Dashboard: "Edit Actions" / "Prioritize Actions" are now individual
lexical-button sections with `authPermissions: {"groups":{"public":[]}}`,
placed on the title row (identity `1/2` + two `1/4` sections — NOTE the mny
sectionArray size map differs from the library default: `1/2`=6 cols, `1/4`=3,
`1`=9). ⚠ Anonymous-hidden E2E requires the page to be PUBLISHED (view mode
renders published sections; the draft can only be seen authed) — flagged for
post-publish verification.
