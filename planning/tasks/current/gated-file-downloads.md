# Files: serve stored files through an authorised route

**Initiatives:** [tes_chat_pattern](../../../../../planning/initiatives/tes_chat_pattern.md) · **Status:** next · **Created by:** amuro@albany.edu · **Edited by:** —

## Objective

A file stored by the upload routes is readable by exactly the people who may read the source it
belongs to. Today it is readable by anyone who has its URL.

Filed 2026-11-18 from chat's direct messages (`dms-template/planning/tessera/tasks/current/chat-direct-messages.md`),
which ship WITHOUT attachments until this is done: a DM's messages are private (its source carries
`reach: { inherit: false, override: false }`, `auth-reach.md`), but a file posted in one would be
reachable by its URL. The gap was listed in `auth-reach.md` under "Not covered".

## The gap

- **Local storage:** `dms-server/src/index.js` mounts `app.use('/files', express.static(storage.dataDir))`
  BEFORE the JWT middleware ("so download links are publicly accessible"). Nothing is judged. The path
  holds the source and view ids, so a URL is guessable from ids that are not secret.
- **S3 storage:** a file's URL may be the bucket's own (`AWS_BUCKET_URL`), served by the bucket, and
  the bucket may be public. Nothing on the server sees the request at all.
- What already judges: `download-routes.js signDownload` / `authorizeViewAction` for dataset
  downloads (exports), not for stored upload files. The upload route itself judges the create.

## Proposed fix (to be designed with the owner)

1. **One read route for stored files**, e.g. `GET /files/:app/:sourceId/:viewId/*`, after the JWT
   middleware: resolve the file's source (and view) from the path, `authorize({ env, sourceId, verb:
   'read' })` (the same judgement as a UDA read, so `reach` applies, enforced under every mode), then
   stream from storage (local: `res.sendFile` under `dataDir` with a path check; S3: stream, or a
   short-lived signed URL redirect).
2. **Keep the open path for open sources** as a compatibility step: a source that is blank or public
   keeps working at its old URL; a reach-limited source's files 404 at the old URL. Decide whether the
   old URL is dropped later (every stored link in content, e.g. Lexical images, uses it).
3. **Signed-in fetches from `<img>` / `<a>`**: a browser does not send the `Authorization` header on an
   image load. Options: a cookie (see the SSR session-cookie task), or short-lived signed URLs minted by
   an authorised call (`signDownload` is the model). Pick one.
4. **S3**: private bucket, server-signed URLs only; document the bucket policy in the deploy docs.
5. **Clients**: the upload route returns the new URL form; chat's `Attachments` and the Lexical image
   node use it. Then chat turns attachments back on in DMs (the upload carries the DM's grants and
   reach, which the upload route already accepts: `auth_permissions` field).

## Files

- `dms-server/src/index.js` (the static mount), `src/dama/storage` (local / S3), `src/dama/upload/`
  (the URL it returns), `src/routes/auth` (`authorize`, `reachLimited`), `download-routes.js` (signing)
- Client: `ui/` image/file renderers that build file URLs; dms-template `src/patterns/chat/uploads.js`,
  `components/Attachments.jsx`
- Docs: `documentation/admin-permissions.md` (Reach: "Not covered"), `documentation/dms-server-env.md`

## Testing

- [ ] A reach-limited source's file: its grantee reads it; a site admin, another user and anon are
      refused, by the new route and at the old URL
- [ ] An open source's file still loads at the old URL (and the new one)
- [ ] S3 mode: no bucket URL is handed out for a limited source
- [ ] An `<img>` in a page and a chat attachment load for their readers

## Log

- **2026-11-18** — Filed from chat DMs (which ship without attachments until this is done). Not started.
