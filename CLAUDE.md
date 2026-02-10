# DMS Library

The `@availabs/dms` library providing a pattern-based routing system for React applications.

## Packages

- **`packages/dms-server`** - Express.js server providing Falcor JSON Graph API (see `packages/dms-server/CLAUDE.md`)

## Task Management

All tasks are tracked in the `planning/` directory following a consistent workflow.

### Directory Structure

```
planning/
├── todo.md              # Active tasks organized by topic
├── completed.md         # Completed tasks with dates
├── planning-rules.md    # Full documentation of structure
└── tasks/
    ├── current/         # Detailed task documents for work in progress
    └── completed/       # Archived task documents
```

### Workflow

When creating a new task:

1. **Add to todo.md** - Add a checkbox entry under the appropriate topic:
   ```markdown
   ## dms-server

   - [ ] Fix createData dropping data argument
   ```

2. **Create task file** - Create a detailed task document in `planning/tasks/current/`:
   ```
   planning/tasks/current/fix-createData-drops-data.md
   ```

   Task files should include:
   - Objective
   - Root cause analysis
   - Proposed fix
   - Files requiring changes
   - Testing checklist

3. **Work on the task** - Update the task file as you progress

4. **Complete the task**:
   - Move the task file to `planning/tasks/completed/`
   - Update `todo.md` - change `[ ]` to `[x]`
   - Add entry to `completed.md` with date and link to task file

### Topic Hierarchy

Tasks are organized under these topics in todo.md:

- **api** - Backend API changes, data loading
- **dms-manager** - Admin interface, site management
- **dms-server** - Server, Falcor routes, database
- **ui** - Shared UI components
- **patterns** - Pattern implementations
  - patterns/page
  - patterns/datasets
  - patterns/forms
  - patterns/admin
  - patterns/auth

### Important

**Before implementing any task, read `planning/planning-rules.md`** — it defines the full workflow including how to track progress in task files during implementation.

When asked to create a task or plan work:
1. Always create the task file in `planning/tasks/current/`
2. Always add a todo entry to `planning/todo.md`
3. Keep the todo list updated as work progresses
4. Move completed tasks to `planning/tasks/completed/` and update `completed.md`

When implementing a task:
1. Read the task file in `planning/tasks/current/` before starting
2. **Update the task file as you complete each phase/step** — mark items `[x]`, add status to phase headers, note deviations
3. The task file is the **source of truth** for what has been done and what remains — future sessions depend on it
