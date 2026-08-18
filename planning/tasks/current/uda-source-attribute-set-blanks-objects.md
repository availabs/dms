# Setting an object-valued source attribute silently blanks it

**Status:** NOT STARTED
**Created:** 2026-08-13
**Topic:** dama

## Objective

Make `uda[env].sources.byId[id][attr]` either accept an object value or reject
it. Today a plain object is accepted, reports success, and **destroys the
attribute** — the worst of the three possible outcomes.

## Scope

**In scope**
- The `set` handler for `uda[{keys:envs}].sources.byId[{integers:ids}][{keys:attributes}]`
  and the matching `views.byId` handler, which has the same shape.
- Whether the encoding contract (`JSON.stringify` at the call site) belongs at
  the call site at all.

**Out of scope**
- Changing how `updateSource` writes to Postgres.
- The DMS (`isDms`) branch, whose attributes nest inside `data` and behave
  differently.

## Current State

The route writes whatever the Falcor router leaves at the leaf, straight
through (`packages/dms-server/src/routes/uda/uda.route.js:135`):

```js
const rows = await updateSource(pgEnv, sourceId, sourcesById[sourceId]);
```

There is no normalization of the incoming value, so the caller's encoding decides
what lands in the column. Three encodings, three different outcomes:

| Sent as | What the router does | What lands in `metadata` |
|---|---|---|
| plain object `{columns: […]}` | descends into it as a **branch**; nothing reaches the leaf | `{}` — **the attribute is destroyed** |
| `{$type:'atom', value:{…}}` | treats it as a leaf, verbatim | `{"$type":"atom","value":{…}}` — real data nested a level down |
| `JSON.stringify({…})` | scalar leaf | correct |

Only the third is right, and nothing in the route says so. The knowledge lives
in the client instead, as a one-line helper
(`packages/dms/src/patterns/datasets/pages/dataTypes/default/utils.js:103`):

```js
const toWireValue = (data) => (data !== null && typeof data === 'object') ? JSON.stringify(data) : data;
```

Every UI path goes through `updateSourceData`/`updateVersionData`, so the UI is
correct today. Any other caller — a migration script, a plugin, a test — has to
rediscover this, and the failure mode for getting it wrong is silent.

### Observed impact

Hit live 2026-08-13 while enabling `isEditable` on the four WCDB sources
(`project-planning/wcdb/tasks/completed/migrate-wcdb-datasets-to-pgenv.md`).
Sending the metadata object plainly returned success and wrote `{}` to
`data_manager.sources.metadata` for source 11, discarding its whole
`columns` array (8 columns of names, types and display names). It had to be
rebuilt from `information_schema`. The atom-wrapped attempt before it wrote the
envelope into the column, which at least preserved the data but left every
consumer reading `metadata.columns` seeing nothing.

Note the client already hedges against exactly this class of failure —
`updateSourceData` resolves to the value the *server* echoes back rather than
the value it sent, with the comment:

> Resolving to this confirmed value (not just "the promise didn't reject") lets
> callers verify the write actually landed instead of trusting a round trip that
> could silently no-op.

That defence is at the wrong layer: it lets a caller *detect* the blanking after
the attribute is already gone, rather than preventing it.

## Proposed Changes

1. **Normalize in the route.** Before calling `updateSource`, coerce each
   attribute value: unwrap a `$type: 'atom'` envelope, and accept a plain object
   by treating it as the value. This makes all three encodings do the right
   thing and is backward compatible with the JSON-string path the UI uses.
2. **Reject what cannot be honoured.** If a value arrives as `{}` for an
   attribute whose stored value is a non-empty object, that is far more likely
   to be this bug than an intentional clear. At minimum log it; consider
   requiring an explicit sentinel to clear an attribute.
3. **Move `toWireValue` server-adjacent, or document the contract on the route.**
   The encoding rule should not be discoverable only by reading a client helper.

Do 1 regardless. 2 and 3 are the difference between fixing this instance and
making the next one impossible.

## Files Requiring Changes

| File | Change |
|---|---|
| `packages/dms-server/src/routes/uda/uda.route.js` | normalize values in the `sources.byId` set at :113-135 |
| `packages/dms-server/src/routes/uda/uda.route.js` | same treatment for the `views.byId` set at :274 |
| `packages/dms-server/tests/test-uda.js` | round-trip test per encoding |
| `packages/dms/src/patterns/datasets/pages/dataTypes/default/utils.js` | keep `toWireValue`; note it is belt-and-braces once the route normalizes |

## Testing Checklist

- [ ] Setting `metadata` as a **plain object** stores the object and preserves
      every key — this is the reported bug and must be the first test written.
- [ ] Setting it as a **JSON string** still works (the UI path must not regress).
- [ ] Setting it **atom-wrapped** stores the unwrapped value, not the envelope.
- [ ] A partial update (`{isEditable: true}`) does not drop sibling keys, or if
      the route is replace-semantics by design, that is asserted and documented.
- [ ] The same three cases against `views.byId`.
- [ ] Round-trip: set → get returns an equal object for all three encodings.
- [ ] An attribute that is legitimately `{}` can still be written, so the
      guard in change 2 does not block a real clear.

## Notes

Found alongside [[uda-pk-removal-rejects-ingest-pk]] during the same WCDB
migration. This is the more serious of the two: the other fails loudly, this one
succeeds and loses data.
