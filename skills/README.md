# DMS Skills

Self-contained how-to documents for common authoring tasks in the DMS. Each skill is a short, action-oriented recipe — read it once, do the thing, link out for deeper context.

Skills sit alongside `planning/` (work tracking) and `documentation/` (reference material) but with a different purpose: **skills tell you how to accomplish a specific outcome**, end-to-end, in the project's idioms.

## Index

### Building components

- [Creating a page-section component](./creating-page-section-components.md) — when you need a new section type (Card, Spreadsheet, Header, etc. are page-section components). Walks through the file split (`Foo.jsx` + `Foo.config.{js,jsx}` + `Foo.theme.js`), the registry entry shape, the EditComp/ViewComp contract, theme wiring, and Fast-Refresh rules.

### Layout reference

- [Card section layout](./card-layout.md) — every layout knob on the `Card` section: the two grids (cards-grid + cells-grid), `cellSpan`/`cellRowSpan`, image/link/format cells, `cardHints` (`fullBleed`, `spanFullColumns`), the `row` prop available to composite column types, and recipes for stat strips / 3-up record cards / composite "owns its own layout" cells. Read before configuring any non-trivial card.

### Recipes — configured sections (no new component needed)

- [Currently-active row card (WCDB schedule "Now Airing")](./now-airing-card.md) — render the row whose `[start_at, end_at]` interval contains `now()`. Per-pattern data shape with day-of-week + time-of-day columns, calc-column projection to absolute timestamptz, `op:'time'` `kind:'instant'` filter with `compareEnd`. The pattern works for any "currently happening" feed (event calendars, live indicators, on-call rotations).

## How skills are organized

- **One skill per file.** The skill should answer one specific question ("how do I add a new section type?", "how do I make a 'currently active' card?").
- **Self-contained.** A reader shouldn't have to chase three other docs to follow along. Inline the load-bearing snippets; cross-link the rest.
- **Actionable.** Lead with the steps. Background and "why" come after, not before.
- **Examples from the repo.** Skills should reference real files, not invented ones — that way they stay verifiable.

## When NOT to write a skill

- The task is too narrow to recur (one-off migration script).
- The information already lives in `CLAUDE.md` (project conventions) or `documentation/` (reference). Skills layer on top of those, they don't duplicate them.
- The pattern hasn't been used yet — skills capture proven patterns. New patterns start as task documents in `planning/tasks/current/` and graduate to skills after a real use case ships.

## Adding a new skill

1. Pick a clear outcome-oriented title ("Creating X", "Configuring Y", "Migrating Z").
2. Write the file in `src/dms/skills/<kebab-case-title>.md`.
3. Add an entry to the Index above with a one-line hook.
4. Cross-link from any task documents that motivated the skill (and from `CLAUDE.md` / `documentation/` where relevant).
