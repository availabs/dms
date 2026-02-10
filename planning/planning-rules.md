# Planning Directory Structure

This document describes the structure and conventions for the DMS planning directory.

## Directory Structure

```
planning/
├── roadmap.md           # High-level roadmap and vision
├── todo.md              # Active tasks organized by topic
├── completed.md         # Completed tasks organized by topic
├── planning-rules.md    # This file - structure documentation
└── tasks/
    ├── current/         # Detailed task documents for work in progress
    └── completed/       # Archived task documents for completed work
```

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
