# Extract Embedded Images from Lexical Data — DONE

## Objective

Write a dms-server script that scans `data_items` rows for Lexical JSON containing base64-encoded images (`data:image/...;base64,...` in `InlineImageNode` `src` fields), extracts them to files on disk, and replaces the inline data URIs with URL paths pointing to the extracted files.

## Problem

Lexical's `InlineImageNode` stores uploaded images as base64 data URIs directly in the node's `src` field. These are serialized into the `element-data` JSON string inside section data (`data.element.element-data`). A single high-resolution image can add 5-20MB+ of raw text to a database row. For sites like mitigat-ny-prod/redesign, this results in 20MB+ sections and massive total database size.

## How Images Are Stored

### Lexical node structure

Images are `InlineImageNode` (Lexical type `"image"`) defined in:
- `packages/dms/src/ui/components/lexical/editor/nodes/InlineImageNode.tsx`

Serialized JSON shape:
```json
{
  "type": "image",
  "version": 1,
  "src": "data:image/png;base64,iVBORw0KGgo...",
  "altText": "screenshot.png",
  "width": 800,
  "height": 600,
  "position": "full",
  "showCaption": false,
  "caption": { "editorState": { "root": { "children": [] } } }
}
```

### Where in the data column

Section rows have type `{doc_type}|cms-section`. Their `data` column structure:
```json
{
  "element": {
    "element-type": "richtext",
    "element-data": "{\"text\":{\"root\":{\"children\":[...lexical nodes...]}},\"bgColor\":\"\"}"
  }
}
```

The `element-data` value is a **JSON string** (double-encoded). Inside it, `text.root.children` contains the Lexical node tree. Image nodes can appear at any depth (inside paragraphs, layout containers, etc.).

### Image insertion paths

1. **File upload dialog** (`InlineImagePlugin/index.tsx` line 80-91): `FileReader.readAsDataURL()` → base64 data URI → stored in node `src`
2. **Drag & drop paste** (`DragDropPastePlugin/index.ts`): `mediaFileReader()` → data URI → dispatches `INSERT_INLINE_IMAGE_COMMAND`

Both paths produce `data:image/{format};base64,...` strings in the `src` field.

## Proposed Script

### Location

`packages/dms-server/src/scripts/extract-images.js`

### Usage

```bash
node src/scripts/extract-images.js --source <config> [options]

# or via npm
npm run db:extract-images -- --source <config> [options]
```

### Arguments

| Flag | Required | Description |
|------|----------|-------------|
| `--source <config>` | Yes | Database config name (from `src/db/configs/`) |
| `--output <dir>` | No | Directory to write image files (default: `./extracted-images`) |
| `--url-prefix <path>` | No | URL path prefix for replacement src values (default: `/img/`) |
| `--app <name>` | No | Only process rows for a specific app |
| `--type <type>` | No | Only process rows matching this type (e.g., `redesign\|cms-section`) |
| `--dry-run` | No | Report what would be extracted without writing files or updating DB |
| `--min-size <bytes>` | No | Only extract images larger than this threshold in bytes (default: 0, extract all) |

### Algorithm

1. **Scan**: Query all `data_items` rows where `data` contains `data:image` (use `LIKE '%data:image%'` or equivalent)
2. **Parse**: For each row, parse `data` JSON, then parse inner `element-data` JSON string
3. **Walk**: Recursively walk the Lexical node tree looking for nodes with `type: "image"` whose `src` starts with `data:image/`
4. **Extract**: For each matching image:
   - Decode the base64 payload
   - Detect format from the MIME type (`data:image/png;base64,...` → `.png`)
   - Generate a unique filename: `{item_id}_{node_index}_{hash8}.{ext}` where `hash8` is first 8 chars of a content hash (SHA-256 or similar) to enable deduplication
   - Write the file to `{output}/{filename}`
5. **Replace**: Set the node's `src` to `{url-prefix}{filename}` (e.g., `/img/12345_0_a1b2c3d4.png`)
6. **Re-encode**: Stringify the modified Lexical tree back into `element-data`, then stringify the outer `data` object
7. **Update**: Write the modified `data` back to the database row
8. **Report**: Print summary — rows processed, images extracted, total bytes saved, before/after sizes

### Deduplication

If two image nodes have identical content (same base64 payload), they should produce the same file (same content hash). The script should:
- Check if the output file already exists before writing
- Reuse the same URL for duplicate images across rows

### Safety

- **Dry run by default behavior**: The `--dry-run` flag should show what would happen without modifying anything
- **Backup awareness**: Print a warning recommending a database backup before running without `--dry-run`
- **Transaction per row**: Each row update should be in its own transaction so partial failures don't corrupt data
- **Verify round-trip**: After re-encoding, verify the JSON is valid before writing to DB

### File serving

The script itself does not handle serving the extracted files. The extracted images need to be served by the web server at the configured `--url-prefix` path. This is an operational concern:
- For dms-server: add a static file middleware for the output directory
- For Netlify/static deploys: copy extracted files into the build output
- For development: configure Vite's `public/` directory or a proxy

The task file for adding static file serving to dms-server is out of scope — just document the requirement in the script's output.

## Files Requiring Changes

| File | Change |
|------|--------|
| `packages/dms-server/src/scripts/extract-images.js` | **New** — main script |
| `packages/dms-server/package.json` | Add `db:extract-images` npm script |
| `packages/dms-server/src/scripts/README.md` | Document the new script |

## Testing Checklist

- [x] Dry run mode correctly reports images found, sizes, and what would be extracted — verified on dms-mitigateny-sqlite
- [ ] Images are correctly decoded from base64 and written as valid image files
- [ ] Generated filenames include item ID and content hash
- [ ] Duplicate images across rows produce the same file (deduplication works)
- [ ] Database rows are updated with correct URL paths in place of data URIs
- [ ] Re-encoded JSON round-trips correctly (no data loss in non-image fields)
- [ ] Works with PostgreSQL source
- [x] Works with SQLite source — verified dry run on dms-mitigateny-sqlite (6825 rows, 5117 with images, 7188 images, ~3GB decoded)
- [x] `--app` filter correctly limits scope
- [ ] `--type` filter correctly limits scope
- [ ] `--min-size` threshold correctly skips small images
- [x] Nested image nodes (inside layout containers, table cells) are found and processed — recursive walkImageNodes
- [x] Sections with no images are skipped without modification
- [x] Non-section rows with embedded images (if any exist) are also processed
- [x] Script prints clear summary with before/after sizes

## Implementation Notes

- Initial approach used `LIKE '%data:image%'` in SQL — took 117s just for COUNT on 63k rows. Replaced with streaming row iteration + fast `String.includes('data:image')` check in JS.
- SQLite: uses raw `better-sqlite3` `stmt.iterate()` to avoid adapter's auto JSON parsing (critical for 20MB+ rows).
- PostgreSQL: uses server-side cursor with `::TEXT` cast to avoid jsonb auto-parsing.
- Content hash is 12-char SHA-256 prefix for dedup across rows.
