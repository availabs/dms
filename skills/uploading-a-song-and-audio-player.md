# Uploading a song file and adding an Audio Player section

End-to-end recipe for getting a new audio file (e.g. an mp3 demo) up to a
DMS `file_upload` source and then rendering it on a page with the
theme-registered **Audio Player** component.

Worked example: `asm+nhomb` → upload `Breakout.mp3` to the "Songs" source
(id `2060573`), add an Audio Player to the songs `/demos` page
(page id `2060568`).

## TL;DR

1. **Upload** the file to the existing `file_upload` source via `POST /dms-admin/:app/file_upload`. The server stores the file on the bucket and creates a new view row with a `data.file.dl_url`.
2. **Create a draft section** of element type `Audio Player` on the target page, with `element-data: { title, audioUrl }` where `audioUrl` is the `dl_url` returned above.
3. **Publish the page** from the editor when ready.

## Prerequisites

The Audio Player section is a **theme-registered** page component
(`theme.pageComponents['Audio Player']`), not a built-in section type.
It must be registered by the site's theme before any page can render it.

- Reference implementation: `src/themes/avail/components/AudioPlayer.jsx`
  (`AudioPlayer.jsx:209-222` for the registry entry).
- Theme registration: `src/themes/avail/theme.js:7` —
  `pageComponents: { "Audio Player": AudioPlayer }`.
- Stored `element-data` shape:
  `{ title: string, audioUrl: string }` — both fields are persisted
  as a stringified JSON inside `element.element-data`.

The site you're authoring on must use a theme that registers
`"Audio Player"` (avail does; check the active theme before assuming it
works on a new site).

## Step 1 — Find the upload target

You need four things to upload:

| Thing | Where to find it |
|---|---|
| `app` | The DMS app the site lives in (`asm`). |
| `source_id` | The `file_upload` source row's id (`2060573`). The source's `data.type` should be `"file_upload"`. |
| `owner_id` | The dmsEnv row that owns the source (`2060502`). |
| `owner_instance` | The dmsEnv's instance segment from its `type` column (`alex_data_env` from `nhomb|alex_data_env:dmsenv`). |

Resolve them with the CLI:

```bash
# Source — check it's a file_upload type and see its dmsEnv via the type column
dms --host https://dmsserver.availabs.org --app asm --type nhomb \
  raw get 2060573 --pretty
# → type: "alex_data_env|practice_recordings:source"
#   data.type: "file_upload"
#   data.name: "Songs"

# dmsEnv — find the row whose data.sources array contains the source_id
dms --host ... --app asm --type nhomb pattern show alex-data --pretty
# → dmsEnvId: 2060502

dms --host ... --app asm --type nhomb raw get 2060502 --pretty
# → type: "nhomb|alex_data_env:dmsenv"
#   data.sources: [{ id: 2060573, ref: "asm+alex_data_env|source" }, …]
```

The `owner_ref` field is whatever's already in `dmsEnv.data.sources[i].ref`
for an existing source — copy it verbatim. For new sources, the server
defaults to `${app}+${owner_instance}|source`.

## Step 2 — Upload the file

The route is `POST /dms-admin/:app/file_upload`. Multipart form fields:

| Field | Required | Notes |
|---|---|---|
| `owner_id` | yes | dmsEnv row id. |
| `owner_instance` | yes | dmsEnv instance segment (`alex_data_env`). |
| `owner_ref` | recommended | The exact ref string from the dmsEnv's sources array. |
| `source_id` | yes if appending | Pass the existing source id to add a new view to it. Omit only when creating a brand-new source. |
| `source_name` | yes if NOT passing `source_id` | Min 4 chars. The server 409s if the resulting `(app, type)` already exists, returning `existing_source_id` so you can retry with that. |
| `file_name` | optional | Defaults to the uploaded file's basename. |
| `file_type` | optional | MIME type. Defaults to the extension. |
| `description` | optional | Stored on the view's `data.file.description`. |
| `categories` | optional | JSON-stringified `[[top, sub]]`. Only meaningful on first source create. |
| `user_id` | optional | Author audit. |
| `file` | yes | The actual file. |

```bash
curl -sS -X POST "https://dmsserver.availabs.org/dms-admin/asm/file_upload" \
  -F "owner_id=2060502" \
  -F "owner_instance=alex_data_env" \
  -F "owner_ref=asm+alex_data_env|source" \
  -F "source_id=2060573" \
  -F "file_name=Breakout.mp3" \
  -F "file_type=audio/mpeg" \
  -F "description=Breakout" \
  -F "file=@/path/to/Breakout.mp3"
```

Response:

```json
{
  "ok": true,
  "app": "asm",
  "source_id": 2060573,
  "view_id": 2060672,
  "dl_url": "https://availabs-bucket.files.availabs.org/dms-asm_env-alex_data_env_s-2060573/v-2060672/Breakout.mp3"
}
```

Server side:
- Creates a new view row under the source (`view_id`), bumps the version
  counter, types it `{sourceSlug}|v{N}:view`.
- Appends the new view ref to `source.data.views`.
- Streams the file to the storage backend at
  `dms-{app}_env-{owner_instance}_s-{source_id}/v-{view_id}/{file_name}`.
- Writes `view.data.file = { file_name, file_type, dl_url, description }`.

Implementation: `packages/dms-server/src/dama/upload/file-upload-dms-route.js`.

### Gotchas

- **409 on `source_name` collision.** If you're creating a new source, the
  server refuses to make a duplicate `(app, {ownerInstance}|{slug}:source)`
  row — it returns `existing_source_id` so you can resubmit with
  `source_id=…` to append a new file/view instead. This is the deliberate
  fix for the 2060573 "Songs" incident
  (`uda-source-lookup-ambiguity.md`).
- **Image processing.** The route auto-resizes images > 1400px and
  converts to AVIF when Sharp is available. Audio/video files pass through
  unchanged.
- **No CLI helper yet.** `dms` does not expose a `file upload` subcommand.
  Use `curl` (above) or the Datasets pattern upload UI.

## Step 3 — Identify the target page + section group

You need:

| Thing | How to get it |
|---|---|
| `page_id` | `dms page list` then `dms page show <slug>` for the URL slug. |
| `section_group` | A name from the page's `data.section_groups[].name` — usually a UUID for theme-default groups. |
| Pattern (CLI flag) | The pattern name to scope type-string resolution. |

```bash
dms --host ... --app asm --type nhomb page show demos --pretty
# → id: 2060568, section_groups[0].name: "1974fc0c-…"
```

Look at one of the existing audio players on the page to confirm the
section_group UUID (`dms section dump <existing-section-id>`); copying it
verbatim avoids a "section renders but has no group" headache.

## Step 4 — Create the Audio Player section

Element-data shape for Audio Player is two fields:

```json
{ "title": "Breakout", "audioUrl": "<dl_url from step 2>" }
```

Wrapper section data:

```json
{
  "group": "<section_group UUID>",
  "parent": "{\"id\":\"<page_id>\",\"ref\":\"<app>+<pattern_instance>|page\"}",
  "element": {
    "element-type": "Audio Player",
    "element-data": "<stringified JSON of {title, audioUrl}>"
  },
  "trackingId": "<uuid>"
}
```

Notes on the shape:
- **`parent` is a JSON STRING**, not an object. The Audio Player editor
  reads it that way and other tooling expects the same shape across the
  page pattern.
- **`element-data` is a JSON STRING.** The editor parses it back out;
  saved sections that store this as an object render as "No audio URL set"
  even when the data is present.
- `trackingId` is any UUID — used by the editor for drag-reorder state.
- Do **not** set `is_draft: true` manually; `section create` writes only
  to `draft_sections` and the server treats that as the source of truth
  for draft state (see `section.js:178-191`).

Build the payload and create:

```bash
node -e "
const data = {
  group: '1974fc0c-700f-45b6-868c-112462270825',
  parent: JSON.stringify({ id: '2060568', ref: 'asm+songs_2|page' }),
  element: {
    'element-type': 'Audio Player',
    'element-data': JSON.stringify({
      title: 'Breakout',
      audioUrl: 'https://availabs-bucket.files.availabs.org/dms-asm_env-alex_data_env_s-2060573/v-2060672/Breakout.mp3'
    })
  },
  trackingId: crypto.randomUUID()
};
require('fs').writeFileSync('/tmp/audio-section.json', JSON.stringify(data));
"

dms --host https://dmsserver.availabs.org --app asm --type nhomb \
  section create 2060568 --pattern songs --data "$(cat /tmp/audio-section.json)"
```

Response: `{ id: <new-section-id>, page_id: 2060568, type: "songs_2|component", message: "Section created and attached to page" }`.

### Gotchas

- **Pattern instance vs. pattern name.** The CLI's `--pattern songs`
  resolves to the row whose name field matches `songs`; the row's type
  column is `nhomb|songs_2:pattern`, so the resulting section type is
  `songs_2|component` (note the `_2`). Hand-built `parent` refs must use
  the *instance segment* (`songs_2`), not the pattern's display name
  (`songs`).
- **Section group must exist on the page.** If you invent a new UUID, the
  section is created but renders outside any group container — usually
  invisible. Copy from an existing section on the same page.

## Step 5 — Publish

`dms section create` adds to `draft_sections` only, never `sections`. The
new section is visible in the editor immediately but won't appear on the
public page until the page is published. Either:

- Open the page in the editor (`/edit/<slug>`) and click Publish, or
- Use `dms page publish <id-or-slug>` for the bulk path.

## Verifying

```bash
# Confirm the section row landed
dms ... raw get <new-section-id> --pretty

# Confirm it's attached to the page's draft_sections
dms ... raw get <page-id> --pretty | jq '.data.draft_sections'

# Smoke-test the dl_url returns the file
curl -I "<dl_url>" | head -5    # expect HTTP/2 200 + content-type audio/mpeg
```

## Related skills and docs

- `now-airing-card.md` — also writes a configured section, but for the
  Card component bound to a data source. The patterns (resolve owner →
  build element-data → `section create` → publish) are the same.
- `src/dms/packages/dms-server/src/dama/upload/file-upload-dms-route.js`
  — the upload route source. Reads the canonical request/response shape.
- `src/themes/avail/components/AudioPlayer.jsx` — what `Audio Player`
  actually renders. Read this if the section saves but doesn't play —
  the `Edit`/`View` components mirror the same `{title, audioUrl}` shape.
- `src/dms/packages/dms/cli/CLAUDE.md#Section Data Format` — element-data
  string convention; the same shape applies to lexical, Card,
  Spreadsheet, etc.
