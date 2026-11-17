# The CLI loads a host app's own commands (`.dmsrc` `commands`), and its writes can be marked `agent`

**Initiatives:** [plat_qa_automation](../../../../../planning/initiatives/plat_qa_automation.md) (primary) · **Status:** built · **Release:** commit — the CLI runs from the checkout, so there's no deploy · **Created by:** rdubowsky@albany.edu · **Edited by:** —

**Project:** dms library (CLI) · **Started:** 2026-11-17 · The app half (the first user, `dms qa`):
dms-template's [qa-cli-ticket-commands.md](../../../../../planning/shared/tasks/current/qa-cli-ticket-commands.md).

## Objective

A pattern type that lives in the host app can ship `dms` commands without the CLI holding any of its code, the way
the page-publish hook already works. Owner (2026-11-17): keep the library change as small as possible.

## The change (about 30 lines, 4 files)

- `cli/src/config.js`: a `.dmsrc` may list `commands`, each path relative to that file. No env variable.
- `cli/bin/dms.js`: before parsing, each listed module's default export is called as
  `register({ program, helpers })`. The helpers are `getConfig`, `getOutputOptions`, `validateConfig`, `makeClient`,
  `resolvePattern`, `parseData`, `fetchById`, `loadDatasetRows`, `output` and `outputError`. A module that fails is
  reported on stderr and skipped.
- `cli/src/client.js` + `utils/data.js` `makeClient`: the client sends `X-DMS-Via: <config.via>`, `cli` unless set.
  App commands set it (e.g. `dms qa … --via agent`). There's no global flag; the server keeps `cli` and `agent` and
  reads anything else as `ui`, so an app validates the value.
- Docs: `docs/README.md` ("App commands", the config table), the CLI's CLAUDE.md, `documentation/pattern-registry.md`,
  `skills/registering-a-pattern-type.md`, `skills/README.md`.

## Testing

- [x] The integration suite, 37/37 (2026-11-17), run inside dms-template, so its root `.dmsrc` loaded `dms qa`.
- [x] `dms qa` writes in a preview stack recorded `via: agent` in the change history.
