# Brand voice folders: text rules for agents, kept off the wire

**Initiatives:** [dms_cli_agent_tooling](../../../../../planning/initiatives/dms_cli_agent_tooling.md) · **Status:** built · **Release:** commit — library `voice/`, the skill and the CLAUDE.md pointers; rules stay Proposed until owners agree · **Created by:** amuro@albany.edu · **Edited by:** —

## Objective

Give every DMS site a place to record how its text should read, in a form that agents (and people) consult
before writing titles, buttons, errors and page copy. Nothing about it reaches the browser.

## Why not the theme object

The owner's first-pass idea, a `voice` key on the theme, was rejected on 2026-11-08: the theme ships to the client
and the voice does no work there. Voice is plain markdown that no module imports, so the bundle doesn't change.

## Design

- Generalizes `src/themes/lab_brand/` (AVAIL lab sites), the worked example. It uses the same file set:
  `README.md` (scope + **pattern → register** map), `writing_style.md` (rules by register,
  Proposed/Agreed, before→after, checks, change log), `preferences.md` (dated, verbatim),
  `references.md` (optional).
- Voice belongs to a **brand**, which can span themes. A single-theme brand keeps it in `<theme>/voice/`.
- **Library default:** `src/dms/voice/writing_style.md` holds the **tool** register (admin and editor UI).
  A brand with its own `## Register: tool` section replaces it whole. There is no library editorial default.
- Discovery: `src/dms/skills/writing-site-copy.md` (brand-folder table and the lookup), an index entry, and
  pointers in the root `CLAUDE.md` and `src/themes/CLAUDE.md`.

## Done

- [x] 2026-11-08 · `src/dms/voice/README.md` + `writing_style.md` (tool register, from the WCDB admin schedule
  dialog review).
- [x] 2026-11-08 · `src/themes/wcdb/voice/`: README (pattern map), `writing_style.md` (editorial register,
  collected from the design-system README's recorded decisions), `preferences.md` (Alex, 2026-11-08).
- [x] 2026-11-08 · Skill `writing-site-copy.md`, its skills-index entry, and the CLAUDE.md pointers.

## Next

- [ ] Owners review the Proposed rules: the tool register (Alex) and WCDB editorial (Alex).
- [ ] Lab sites: a one-line `voice/README.md` in `fusion`, `avail_site`, `community_indicators`, `tessera`
  pointing at `lab_brand/`, if the skill's table isn't enough. Check with Eric first, since `lab_brand` is
  shared work.
- [ ] Optional `dms voice --pattern <name>` CLI command that prints the resolved register files.
- [ ] Optional lint guard against importing from `voice/`.
