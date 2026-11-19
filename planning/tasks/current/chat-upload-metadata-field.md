# DMS file upload: a `metadata` field for a new source, and a `Paperclip` icon

**Initiatives:** [tes_chat_pattern](../../../../../planning/initiatives/tes_chat_pattern.md) · **Status:** built · **Created by:** amuro@albany.edu · **Edited by:** —

## Objective

The chat pattern's file upload (`dms-template/planning/tessera/tasks/current/chat-file-upload.md`)
records on each uploaded file's source which chat install and channel it was posted to. The DMS
upload route took no data beyond name, description and categories, so it gains an optional field. The
composer's attach button needed an icon the set did not have.

## Change

- `packages/dms-server/src/dama/upload/file-upload-dms-route.js`: optional multipart field
  `metadata`, a JSON object merged onto a NEW source's data (ignored when appending a version with
  `source_id`). Keys the route owns or that decide access are refused with 400: `name`, `type`,
  `views`, `categories`, `description`, `config`, `auth_permissions`, `authPermissions`, `sources`,
  `dmsEnvId`. Not JSON, or not an object, is a 400. The library stays type-free: the field is opaque
  data; chat is the first caller.
- `packages/dms-server/docs/upload.md`: documents `POST /dms-admin/:app/file_upload` and the field.
- `packages/dms/src/ui/icons/icon_defs.jsx` + `icons/index.jsx`: `Paperclip`, in the tessera v6
  stroke style (`T6`), registered after `File`; and `ChevronLeft` (the mirror of `ChevronRight`,
  for chat's back control on a phone, 2026-11-17).

## Testing

- [x] `tests/test-upload-auth.js` "metadata: written onto the new source; route-owned and access keys
      refused" — the key lands on the source, `type` stays `file_upload`, five bad values are 400.
      `DMS_TEST_DB=cli-test DMS_DB_ENV=cli-test node tests/test-upload-auth.js`: 38 passed.
- [ ] Live on the hub after a restart, through chat.

## Log

- **2026-11-17** — Built with the chat file upload task.
- **2026-11-17** — `ChevronLeft` added for the chat mobile task.
