# CLI: `dataset query`/`dump` could never return rows

**Status:** FIXED + verified against live data 2026-07-27. Option (b) of three, chosen by the user
(option (a), making the shared `byId`/ref contract type-aware, was rejected as too large a
regression risk — the browser consumes that contract).

## Symptom

`dms dataset query` and `dms dataset dump` returned a correct `total` next to an always-empty
`items`:

```
{"items":[],"total":64800,"source_id":"2107426","view_id":2107427}
```

Worse than an error: any caller that checks `total` concludes the rows exist and then iterates
nothing. Separately, `--filter id=<n>` matched nothing at all, ever.

## Three distinct bugs

### 1. Physical columns went through the `data->>` accessor

`--filter`/`--order` built ``data->>'${col}'`` unconditionally. `id`, `app`, `type`, `created_at`
and `updated_at` are **physical `data_items` columns**, so `data->>'id'` is NULL on every row and
`--filter id=<n>` could never match. Fixed with a `PHYSICAL_COLUMNS` set + `columnAccessor()`.

This is the **third** instance of this exact footgun; the prior two are server-side and already
recorded in `uda-sql-building-landmines` (the custom-buckets `aliasGroups` path, and the `id as id`
calc-name case). Worth treating as a standing hazard anywhere a column name becomes SQL.

### 2. byIndex was requested at a path that matches no route

The server registers these under **different segments** (`dms.route.js`):

| route | segment |
|---|---|
| `dms.data[key].options[opts].length` (`:226`) | `options` |
| `dms.data[key].opts[opts].byIndex[...]` (`:256`) | `opts` |
| `dms.data[key].byIndex[...]` (`:195`) | *(no options segment at all)* |

The CLI used `options` for both, so `length` matched and `byIndex` matched nothing. Unmatched falcor
paths come back as empty `{$type:'atom'}` placeholders, so every row parsed to `{id: undefined}`.

### 3. byIndex returns refs, which this client does not follow

Even at the right path, byIndex yields
`{"0":{"$type":"ref","value":["dms","data","npmrdsv5","byId","2195782"]}}`. The code read
`entry[attr]` straight off the ref, and an `if (row.id)` guard then silently dropped every row.

## Why the fix is UDA, not more `dms.data` patching

Following the ref cannot work for dataset rows **in principle**. Proven side by side:

| row | `dms.data.npmrdsv5.byId.<id>` |
|---|---|
| `2187021` (non-split page template) | real `id` + `data` |
| `2195782` (Routes Data `:data` row) | `id=null data=null` |

`byId` is **app-namespaced only**, but split rows live in per-type tables
(`data_items__s2107426_v2107427_routes_data`). With no `type` there is no way to know which table to
read, and the ref itself omits the type. Same root cause as `dms raw get <split-row-id>` returning
all nulls.

So reading dataset rows through `dms.data` is a **category error**: that family owns content rows
(sites/patterns/pages/components, addressable by app+id). **UDA** owns view rows — it carries
env + view_id, pushes filter/order/limit down to the view, and returns values **inline, no refs**.
It is also what the browser uses for dataset sections (`api/createRequest.js`, `case 'uda'`), so the
CLI now reads the same way the app does.

New `fetchRowsViaUda()` replaces `fetchRowsViaOptions()` (deleted — it had no other callers) in both
`query` and `dump`:

```
['uda', `${app}+${sourceInstance}`, 'viewsById', viewId, 'options', [optsJson],
 'dataByIndex', {from, to}, ['id','data']]
```

The env is derived from the data type's parent segment (`routes_data|2107427:data` → `routes_data`),
which matches the `env` real sections carry in their `externalSource`.

**Deleted a docstring that asserted the opposite of the truth.** The old helper was documented as
"the `options` route inlines attribute values directly so it works for both regular and split
tables" — precisely wrong, and presumably why the bug survived. Removed with the function.

## Also fixed: `raw get` no longer lies about split rows

It returned `{"id":null,"app":null,...}` — reading as "the row exists and is empty". Now, when every
attribute comes back null, it errors and names the command that can read those rows
(`dms dataset query ... --filter id=<n>`). Verified: split row → the signpost; normal row →
byte-identical output to before.

## Verification

- [x] `query --filter id=2195782` → `total: 1, items: 1`, real content (`marker_route`, 9 TMCs). Was
      `total: 1, items: 0`.
- [x] `query --filter name=marker_route` (blob column) → 1 row. Confirms the physical/blob split.
- [x] `dump --limit 3` → 3 real rows with names. Was `items: []`.
- [x] `raw get` on a split row → signpost error; on a normal row → unchanged.
- [x] `node --check` on both touched files.
- [x] **Regression check**: `npm test` fails at `page delete` (`Authentication required to delete
      items`) — reproduced **identically** with `dataset.js` reverted via a path-scoped
      `git stash`, so it is pre-existing and auth-related, not from this change. Note the suite
      aborts there, **before** the dataset tests, so those never ran; the live-data checks above are
      the real evidence.

## Follow-ups not done

- [ ] **The CLI test suite has been broken since 2026-06-30 and cannot reach the dataset tests.**
      Root-caused: commit `7e6a9e4c` ("tracking") added `if (!this.user) throw new
      Error('Authentication required to delete items')` to the `dms.data.delete` route
      (`dms.route.js:490`), but `test/harness.js` sets **no token** (no `DMS_AUTH_TOKEN`, no
      `--auth-token`) and `test/seed.js` creates **no user row**. So `npm test` passes tests 1-11
      (raw/site/pattern/page reads) then dies at test 12, `page delete 13`, with HTTP 500. Two later
      tests would fail the same way (`section create/update/delete lifecycle`, and the raw delete).
      Fix = seed a user + mint a token via the existing `/login` route
      (`auth/routes/auth.routes.js:4`), or skip the guard under the test config. Until then the
      dataset commands have **no automated coverage** — this task's evidence is live-data only.
      The harness is otherwise self-contained (own server on :3456, fresh SQLite, `DMS_DB_ENV=cli-test`),
      so it needs no VPN.
- [ ] `dms raw get` still cannot actually READ split rows — only explain itself. Fixing that is
      option (a) (type-aware refs/byId) and remains deliberately deferred.
- [ ] `--filter` only supports equality. UDA supports far more (ranges, like, groupBy); the CLI
      exposes none of it.
