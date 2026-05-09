# Planning Directory Structure

This document describes the structure and conventions for the DMS planning directory.

## Directory Structure

```
src/dms/
├── planning/
│   ├── roadmap.md           # High-level roadmap and vision
│   ├── todo.md              # Active tasks organized by topic
│   ├── completed.md         # Completed tasks organized by topic
│   ├── planning-rules.md    # This file - structure documentation
│   └── tasks/
│       ├── current/         # Detailed task documents for work in progress
│       └── completed/       # Archived task documents for completed work
├── research/                # Research documents — tech analysis, design exploration, options evaluation
│   └── *.md                 # One file per topic (e.g., dama-refactor.md, sync-architecture.md)
└── documentation/           # System documentation — how things work, schemas, reference material
    └── *.md                 # One file per topic (e.g., dama-current-system.md, sync.md)
```

### Where to put research vs. documentation

- **`research/`** (`src/dms/research/`) — Exploratory analysis, tech stack evaluations, refactor proposals, design options, recommendations. These inform decisions and task creation. They may become outdated as decisions are made.
- **`documentation/`** (`src/dms/documentation/`) — Factual reference material describing how systems work (or worked). Schema docs, architecture overviews, API references, operational guides. These should be kept accurate as the system evolves.

## File Conventions

### todo.md

Active tasks organized by topic hierarchy:

```markdown
# DMS Todo

## Topic Name

### Subtopic Name (if applicable)

- [ ] Task description
- [ ] Another task
```

### completed.md

Completed tasks organized by the same topic hierarchy, with dates:

```markdown
# DMS Completed Tasks

## Topic Name

### Subtopic Name (if applicable)

- [task-name.md](./tasks/completed/task-name.md) - Brief description (YYYY-MM-DD)
```

### Task Files (tasks/current/ and tasks/completed/)

Detailed task documents should include:
- **Objective** - What the task accomplishes
- **Scope** - What's included/excluded
- **Current State** - How things work now
- **Proposed Changes** - What will change
- **Files Requiring Changes** - Specific files and modifications
- **Testing Checklist** - How to verify the changes work

## Topic Hierarchy

Tasks are organized under these high-level topics:

### api
Backend API changes, data loading, Falcor routes

### dms-manager
DMS admin interface, site management

### patterns
Changes to pattern implementations, organized by pattern:

- **patterns/page** - Page pattern (content pages, sections, components)
- **patterns/datasets** - Datasets pattern (data source management)
- **patterns/forms** - Forms pattern (form builder, submissions)
- **patterns/admin** - Admin pattern (site administration)
- **patterns/auth** - Auth pattern (authentication, authorization)

## Workflow

1. New tasks are added to `todo.md` under the appropriate topic
2. When starting work on a task, create a detailed task file in `tasks/current/`
3. **CRITICAL — Update the task document as you work (not just at the end):**
   - Convert plain list items (`-`) to checklists (`- [x]` / `- [ ]`) as items are completed
   - Add brief evidence or notes next to completed items (file paths, key decisions)
   - Record design decisions that deviated from the original spec with a **Design note**
   - Mark phase/section headers with status (e.g., `### Phase 1: Foundation — DONE`)
   - Update testing checklists to distinguish verified items from those still needing live testing
   - The task document is the **source of truth** for implementation status, not just the original plan
   - **After completing each phase or finishing a work session, update the task file BEFORE moving on.** This is non-negotiable — skipping this step causes duplicate work in future sessions.
4. When work is completed:
   - Move the task file to `tasks/completed/`
   - Move the task entry from `todo.md` to `completed.md` with the completion date
   - Link to the task file in `completed.md`
   - **If the task created or configured data inside the DMS** (a new section type, a new dataset shape, a configured pattern with non-obvious wiring, a recurring authoring workflow), **consider extracting a skill** to `src/dms/skills/`. See "When to extract a skill" below.

## When to extract a skill

The `src/dms/skills/` folder holds outcome-oriented how-tos for repeatable authoring tasks (creating a section type, configuring a "currently active" card, provisioning a new dataset plugin, etc.). Tasks frequently produce skill candidates as a byproduct, but only some warrant capture.

A task is a **skill candidate** when it:

- **Creates or configures DMS data**: a new section / column type, a new dataType plugin, a configured page section with non-obvious wiring (calc columns, joins, filter trees), a new dataset shape, or any recurring authoring pattern someone else will replicate.
- **Hit non-obvious gotchas** that took real debugging — the kind of thing the next person would re-hit if the lessons stay buried in commit messages or task docs.
- **Has a clear "do this to get that" framing.** If you can write a one-line outcome ("render a card showing the row whose interval contains now()"), it's a skill. If the outcome is "we shipped feature X," it's a task summary, not a skill.

**Don't write a skill** when:

- The pattern is one-off (a migration, a hotfix, a site-specific tweak that no one else will repeat).
- The information already lives in `CLAUDE.md` (project conventions) or `documentation/` (system reference) — link to those instead of duplicating.
- The pattern hasn't been used yet. Skills capture *proven* patterns; speculative ones stay as task notes until a real consumer ships against them.

**How to extract:** at task-completion time, write a `src/dms/skills/<kebab-case-outcome>.md` modeled on the existing entries (see `now-airing-card.md` for a recipe-style skill, `creating-page-section-components.md` for a broader how-to). Add an entry to `skills/README.md`'s index. Cross-link from the now-completed task file so the trail is traceable.

## Plans Must Be Written Into the Task File

When plan mode is used to design an implementation approach, the resulting plan **must be written in detail into the task file** in `tasks/current/`. The task file is the single source of truth — plans that only exist in conversation context are lost between sessions. Specifically:

- **Before implementing**: Write the full plan into the task file, including step-by-step implementation details, file paths, code patterns, and architectural decisions.
- **Plan granularity**: Plans should be detailed enough that a future session can pick up and implement without re-researching. Include specific function signatures, data flow descriptions, and integration points.
- **Plan updates**: If the plan changes during implementation (new discoveries, design pivots), update the plan in the task file to reflect the actual approach taken.

## Task Document as Source of Truth

The task file in `tasks/current/` must always reflect the actual state of work. When implementing a task (especially multi-phase tasks), **update the task document at the end of each phase or work session** before finishing. This is critical because:

- Future sessions (including AI agents) rely on the task document to know what has been done and what remains
- Memory files (`MEMORY.md`) supplement but do not replace the task document
- If the task doc says "Phase 2: NOT STARTED" but the code is done, the next session may redo the work

**Checklist for each work session:**
- [ ] Phase/section headers updated with status (DONE, IN PROGRESS, NOT STARTED)
- [ ] Individual items converted from `- ` to `- [x]` or `- [ ]`
- [ ] Design notes added for any deviations from the original spec
- [ ] Testing checklist updated with verified vs. unverified items
- [ ] New files listed with brief descriptions
