# Auth: the row's creator in the rule language, and rule variants

**Initiatives:** [tes_chat_pattern](../../../../../planning/initiatives/tes_chat_pattern.md) · **Status:** built · **Release:** commit, then deploy the server and register the formats — see "Deploy" · **Created by:** amuro@albany.edu · **Edited by:** —

## Objective

Let a rule say "only the person who made this row", generically, and let a pattern apply such a rule to
SOME rows of a kind without changing it for every other row of that kind. Asked for by chat's
"edit and delete your own messages" (`dms-template/planning/tessera/tasks/current/chat-edit-delete-own-messages.md`):
a message row is a dataset `:data` row, judged by the env format's `data` rule
(`ops: { '*': ['edit-source-data'] }`), so anyone who may post may edit or delete any message through
the API. Every other dataset row must behave exactly as today.

## Design (built 2026-11-18)

### 1. `creator: true` on a requirement

`{ perms: ['edit-source-data'], creator: true }`: the verb on the rule's owner, AND the caller is the
row's creator. Usable anywhere a requirement is (an op, `byKey`, `default`, inside `anyOf`).

- **Creator = the row's `created_by` column.** `dms.controller.js createData` writes it from
  `this.user` (the verified token); a client can't supply it — a `created_by` key in a payload lands in
  `data`, not the column (tested). On a create, the caller is the creator.
- `authorize` (`routes/auth/index.js`) computes `creator` from the stored row and hands it to the judge
  in `env`. The judge stays pure: `satisfied` checks `env.creator` only when a requirement says
  `creator: true`, so every existing rule is judged exactly as before.
- **Split rows** were judged with `{ id, type, data: null }` (`dms.route.js storedRows`); they now carry
  `created_by`, read from the split table (`controller.getSplitRowCreators`). Main-table rows get it from
  `getRowsForWrite` (one more column).
- A refusal reads `missing edit-source-data as the row's creator`.

### 2. `fieldsFrom: 'rule'` on an edit spec

`editRequirements` lets the governing vocabulary's field claims answer first. Under an env, a data row's
vocabulary is the env's `descendants` (`admin+dmsenv`), where `update-source` claims `'*'` — so with any
object edit spec, every data-row key would ask `update-source` (found by registering the formats in the
test; the shared rule never hit it because its spec is an array). `fieldsFrom: 'rule'` says the spec's
`byKey` / `default` decide every key.

### 3. Rule variants: `<kind>@<name>`, named by an ancestor

The data rule is the env format's and global per site (`formats.js`: "a kind's rule is global per site"),
so a pattern can't redeclare `data` for its own rows. Options weighed:

| Option | Why not / why |
|---|---|
| Change the shared `data` rule | changes every dataset |
| A stamp (`authRules`) on the chat env row | stamps are read only when the formats say nothing about the kind, and are being retired (format-declarations Phase 4) |
| An opt-in flag on the source, read by the shared rule | puts a condition in every dataset's rule; a channel admin could flip it |
| **A named variant declared in the pattern's format, chosen by a container row** | the rule is declared data (registered, not caller-written); the opt-in is one key on a container; the core names no kind or pattern |

- A format declares `rules: { 'data@chat_message': rule }`. `formats.js` indexes it under that key; no
  row kind is `data@…`, so on its own it rules nothing (and an older server ignores it the same way).
- A row names the variant for the rows of a kind beneath it: `data.ruleVariants: { data: 'chat_message' }`
  (chat: the install's env row, `channels.js ensureChatEnv`). `owners.js variantFor`: the nearest
  ANCESTOR (never the row itself) naming a variant that the site's `formats` declare. A name not declared
  is passed over — an unregistered site keeps today's rule, and a source can't shadow its env's variant
  with a bogus name (tested).
- **Changing `ruleVariants`** on a stored row is the same escalation as changing `authRules`, and gets the
  same check (`rulesWrite`): site `*` or `<app> Admin`. A create may set it (no rows beneath yet). Known
  limit: whoever may create a source under the env could create it naming ANOTHER declared variant for
  its own rows; with one variant declared (chat's) there is nothing to choose.

### Chat's use (in dms-template, not the library)

`src/patterns/chat/chat.format.js`:

```js
'data@chat_message': {
  owner: ['ancestor:dmsenv', 'ancestor:source'], appliesWhen: 'split', noChange: ['edit-source-data'],
  ops: {
    create: ['edit-source-data'],
    delete: { perms: ['edit-source-data'], creator: true },
    edit: { fieldsFrom: 'rule',
            byKey: { reactions: …, reply_count: …, last_reply_at: … },   // ['edit-source-data']
            default: { perms: ['edit-source-data'], creator: true } },
  },
}
```

Fields other members write on someone else's message, found in chat's code: `reactions`
(`messages.js toggleReaction`) and the thread counters `reply_count` / `last_reply_at`
(`ThreadPane.send`). Mentions and notifications write membership rows, not messages. Everything else —
`body`, `format`, `edited_at`, `deleted_at`, `attachments`, and also `author`, `ts`, `thread_id`,
`broadcast`, `source` — is the author's (the default), which also closes "edit someone's `author`".

## Backwards compatibility

- No `creator` clause in a rule → `env.creator` is never read. No `fieldsFrom` → the vocabulary answers
  first, as before. No ancestor naming a declared variant → `ruleFor` is unchanged.
- Datasets: `test-auth-creator.js` checks a second env without `ruleVariants` (B edits and deletes A's
  row) and `ruleFor` returning the shared `data` rule there; the existing suites pass unchanged (below).
- Existing chat installs: their env rows name nothing, so their messages keep the shared rule until a
  site admin names the variant (`src/patterns/chat/scripts/scope-message-rule.mjs`, dry run by default).

## Deploy

Order: server first, then the registration, then the existing installs.

1. **Deploy dms-server** with this change. Before it, an env naming `ruleVariants` is ignored (today's rule).
2. **Register the formats** on every app with a chat install: from the server checkout,
   `node src/scripts/register-formats.js --db <config> --app <app> --extra <dms-template>/src/patterns/qa/qa.format.js --extra <dms-template>/src/patterns/chat/chat.format.js --extra <dms-template>/src/patterns/mapeditor/mapeditor.format.js`
   (dry run; review; then `--apply`). It writes the changed `dms-site+chat` row (the variant). Rules
   reach the server only through the `formats` table; the chat pattern row's stamp is not on a message
   row's walk, so stamps can't carry this.
3. **Existing installs**: name the variant on each chat env row, as a site admin:
   `node src/patterns/chat/scripts/scope-message-rule.mjs --host <server> --app <app> --site <site instance> --instance <chat instance>`
   (dry run), then `--apply`. New installs get it from `ensureChatEnv`.
4. Under `DMS_AUTH_MODE=log` a refused edit is only logged (`would-deny … as the row's creator`), as every
   other refusal there; "only the author" is enforced under `enforce`.

None of this was run against the hub (owner, 2026-11-18: no writes to it from this session).

## Files

- `dms-server/src/routes/auth/judge.js` — `creator` in `one` / `satisfied` / the refusal reason; `fieldsFrom`
- `dms/src/utils/authJudge.js` — the same (sync test), `judgeEnv(user, grants, { creator })`
- `dms-server/src/routes/auth/owners.js` — `variantFor`, `ruleFor` reads it first
- `dms-server/src/routes/auth/index.js` — `creator` in the judge's env; `rulesWrite` covers `ruleVariants`
- `dms-server/src/routes/dms/dms.route.js`, `dms.controller.js` — `created_by` on the rows the write guard judges
- `dms-server/tests/test-auth-creator.js` (new, in `npm test`, `npm run test:auth-creator`)
- `documentation/admin-permissions.md` ("The row's creator, and rule variants"), `extension-points.md`

## Testing

- [x] Before (2026-11-18, sqlite): `npm test` passes; `test-auth`, `test-data-auth`, `test-source-auth`,
      `test-uda-auth`, `test-auth-vocabulary`, `test-site-grants`, `test-auth-permissions`,
      `test-datatype-auth`, `test-schedule-auth`, `test-auth-snapshot-reload`, `test-sync`,
      `test-change-history`, `test-read-auth`, `test-pgenv-auth`, `test-formats`, `test-auth-reach`,
      `test-field-read-auth`, sync vitest, client `utils` + `declarations.test.js` pass; `test-uda` fails
      2 (the known two, auth-reach.md baseline).
- [x] After: the same, unchanged; `authJudge.sync.test.js` passes with the new bodies.
- [x] `tests/test-auth-creator.js` (18): judge (creator, anyOf, no clause, fieldsFrom); unregistered →
      today; registered: author edits / soft-deletes / hard-deletes own, another member refused body,
      `deleted_at`, `author`, body beside a reaction, hard delete; may react; empty edit needs the verb;
      a payload `created_by` is not the column; `<app> Admin` allowed, a site/env `*` holder refused; the
      env with no variant unchanged; `ruleFor` per env and never from the row itself; `ruleVariants`
      changes refused to a create-source holder, allowed to site `*` / admin; a bogus name on a source
      doesn't shadow the env's.
- [x] Chat end to end: `src/patterns/chat/tests/messageAuthor.server.mjs` (15) — see the chat task.
- [ ] Postgres run (the split-row `created_by` read and the UDA `created_by` projection are the same SQL
      on both; not run, no Docker run).

## Log

- **2026-11-18** — Filed and built from the chat task (owner: own messages only, conservative defaults).
  Not committed.
