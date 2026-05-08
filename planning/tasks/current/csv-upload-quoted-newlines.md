# CSV upload parser: respect quoted-field newlines

## Objective

The DAMA CSV upload pipeline (`csv-publish` worker) currently splits the CSV stream with `split2` on `\n`, which treats every line break as a record boundary. RFC-4180 explicitly permits embedded `\r\n` and `\n` inside double-quoted fields, and well-formed exports from real systems (the WCDB schedule export, for one) carry editorial newlines inside description columns. Today, those uploads either fail outright (column count mismatch on continuation lines) or silently truncate the field and shift every subsequent column by one — both producing garbage in the per-view table.

Fix: replace the `split2('\n')` step with a streaming RFC-4180 parser that treats `\n` / `\r\n` inside `"…"` as part of the cell, not a record break. Keep the COPY-stream upload path; only the byte-stream-to-record-stream stage changes.

## Scope

**In:**
- Replace `split2('\n')` in `dama/upload/workers/csv-publish.js` with a streaming CSV parser that handles quoted-field newlines.
- Likely move to `csv-parse` (the streaming parser, not the sync one) — it's the canonical Node-side CSV parser, has a streaming interface, supports the column-aware metadata DAMA expects downstream, and `csv-stringify` is a natural counterpart for any future export work. Alternatives evaluated below in **Open Questions**.
- Cover `\n`-only and `\r\n` line endings; exports from Excel/Numbers vary.
- Cover quote escaping per RFC-4180: `""` inside `"…"` → literal `"`.
- Tests: unit-test the parser-stage in isolation against fixtures with: bare quoted multi-line, multi-line followed by another quoted multi-line, mixed `\n`/`\r\n` records, `""` escaped quotes, and a real WCDB-shaped fixture.
- Re-run `tbl_Schedule_*.csv` upload smoke after the fix to confirm a CSV with embedded newlines uploads cleanly without the prep-time stripping currently done in `references/wcdb/clean-schedule.cjs`.

**Out:**
- Custom delimiters / quote characters at upload time (the parser supports them but the upload UI doesn't expose them — out of scope until a real use case appears).
- Performance optimization beyond what `csv-parse`'s streaming mode already gives. The existing `pg-copy-streams` pipeline backs everything anyway.
- Schema inference changes (`analyzeSchema.js`). Inference reads bytes / runs `ogrinfo`; it doesn't depend on the runtime parser used at COPY time.

## Current State

`packages/dms-server/src/dama/upload/workers/csv-publish.js:55-112` (verified 2026-05-08):

```js
let pg, copyFrom, split2;
try {
    pg = require('pg');
    copyFrom = require('pg-copy-streams').from;
    split2 = require('split2');
} catch (err) {
    throw new Error('CSV publish requires pg + pg-copy-streams + split2. …');
}

// …

  .pipe(split2())          // <— record boundary on every \n, ignoring quote state
  .pipe(/* downstream COPY pipeline */)
```

`split2` is a line-splitter with no awareness of CSV grammar. Quoted-field newlines split mid-record, downstream sees the partial cell as a complete record, the column count check fails (or — worse — rolls into the next legitimate record and silently shifts every column).

The user-visible symptoms:
- Upload fails with a column-count or type-cast error on the row immediately after a multi-line description.
- Or upload succeeds but every column from that row onward is shifted, with no error surfaced.

## Proposed Changes

Replace the byte-stream-to-record-stream stage with `csv-parse` in streaming mode:

```js
const { parse } = require('csv-parse');

readStream
  .pipe(parse({
      bom: true,                  // strip UTF-8 BOM if present
      columns: false,             // we do header handling ourselves; pass-through arrays
      relax_column_count: false,  // catch malformed rows during smoke tests
      trim: false,                // preserve trailing whitespace; user data may rely on it
      skip_records_with_error: false,
      // RFC-4180 defaults: quote = ", escape = ", record_delimiter = '\r\n' or '\n'
  }))
  .pipe(/* existing COPY pipeline, possibly adapted */);
```

`csv-parse` emits an array per logical record, regardless of how many physical lines that record spanned. The downstream COPY pipeline currently expects newline-delimited bytes for `pg-copy-streams`'s text-format COPY — that probably needs to switch to `pg-copy-streams`'s `from('… COPY … FROM STDIN (FORMAT csv)')` or to re-emit each parsed array as a properly-escaped CSV line via `csv-stringify` (single-line by definition). Either way, the change is:

1. Bytes → `csv-parse` → array-per-record stream
2. Array-per-record stream → `csv-stringify` (or hand-rolled escaper that handles `,`, `"`, `\n`) → newline-delimited CSV bytes
3. → existing `pg-copy-streams` COPY

That keeps the COPY path unchanged; only the parsing/re-emitting steps land in front of it.

### Why not just teach `split2` to respect quotes?

`split2` is a line-splitter, not a parser. Adding quote-state tracking to it is essentially writing a CSV parser. `csv-parse` is already that parser, battle-tested, with millions of weekly downloads. No reason to rewrite.

## Files Requiring Changes

- [ ] `packages/dms-server/src/dama/upload/workers/csv-publish.js` — swap `split2` for `csv-parse` streaming, re-emit each record as a single-line CSV row before the COPY pipeline. Keep the existing `pg-copy-streams` consumer.
- [ ] `packages/dms-server/package.json` — add `csv-parse` (and `csv-stringify` if used for re-emit). Drop `split2` if no other consumer.
- [ ] `packages/dms-server/tests/test-upload-pipeline.js` — extend with multi-line-field fixtures (bare `\n`, `\r\n`, `""`-escaped quotes inside multi-line value, real WCDB-shaped excerpt).
- [ ] `references/wcdb/clean-schedule.cjs` — once the fix lands, the newline-stripping step in `cleanText` becomes optional. Decide whether to keep it (defensive) or drop it (test the parser fix end-to-end against the original multi-line file).

## Testing Checklist

- [ ] Unit fixtures pass: bare `\n` inside quoted, `\r\n` inside quoted, `""` escape inside multi-line value, multiple multi-line records adjacent.
- [ ] Real upload of `tbl_Schedule_202605080930.csv` *before* `clean-schedule.cjs` strips newlines — should succeed with row count and column types matching post-strip behavior.
- [ ] Existing single-line CSV uploads still work (regression: csv-publish smoke tests).
- [ ] Column count mismatch errors still surface for genuinely malformed input (e.g. ragged rows).
- [ ] Performance not regressed for large uploads (10 MB+ CSV); spot-check timing on an existing fixture.

## Open Questions

- **`csv-parse` vs hand-rolled parser.** Hand-rolled is ~50 lines and avoids a new dep — but `csv-parse` handles edge cases (BOM, mixed delimiters, comment lines, configurable strict mode) we'll inevitably want. Suggested: `csv-parse`. Revisit only if it turns into a perf bottleneck, which is unlikely.
- **Strict-by-default vs lenient-by-default.** `relax_column_count: false` will surface ragged-row uploads that today silently align-shift. That's better behavior but a visible change for users uploading sloppy CSVs. Suggested: strict by default, lenient as an upload-time option later if there's demand.
- **Schema inference path** (`analyzeSchema.js`). Currently uses `ogrinfo` for GIS and a header-only sniff for CSV. If schema inference also bottoms out in line-splitting somewhere, that needs the same fix. Confirm in implementation.

## References

- WCDB schedule export with embedded newlines: `references/wcdb/tbl_Schedule_202605080930.csv` (current workaround: `clean-schedule.cjs` strips `\n` from text fields before upload)
- Worker code: `packages/dms-server/src/dama/upload/workers/csv-publish.js`
- DAMA CLAUDE.md (`packages/dms-server/src/dama/CLAUDE.md`) on the upload pipeline shape
- `csv-parse` docs: https://csv.js.org/parse/
