# User presence: online / away / offline wherever the UI shows a person

**Initiatives:** [tes_chat_pattern](../../../../../planning/initiatives/tes_chat_pattern.md) · **Status:** planned · **Created by:** amuro@albany.edu · **Edited by:** —

## Objective

Wherever the DMS UI shows a single user — chat's people and DM rows and message avatars, the user
menu, permission editors, a ticket's assignee — a small dot says whether that person is online, away or
offline (owner, 2026-11-18). One answer per user per SITE; no per-room or per-page presence.

## What exists

- Every client tab keeps one sync WebSocket (`dms-server/src/routes/sync/ws.js`, `/sync/subscribe`),
  subscribed per app. The socket does not know the user.
- Lexical co-editing has per-item presence with Yjs Awareness (`ui/components/lexical/editor/
  collaboration.js`): each tab publishes a self-reported `{ name, color, cursor }` into an item room; the
  server keeps a server-side Awareness per room, relays updates, sends the current states to a joiner,
  and Awareness drops a state not renewed for 30 s. Rooms are keyed by item id alone
  (`sync-rooms-cross-app-item-id-collision.md`), and joining is not judged.

## Design

- **The socket knows the user.** The client sends its token when it subscribes; the server verifies it
  as the API does (`auth/jwt.js verifyAndGetUser`, cached). A socket with no token works as today and
  takes no part in presence.
- **One presence set per app, held by the server, from verified sockets only.** userId → its open
  sockets and each socket's state (`active` / `away`). Online = at least one socket; away = every socket
  away; offline = none. Built on the same pattern as the Lexical rooms (a server-side Awareness per app,
  awareness-only: no Y.Doc, nothing persisted), so a dropped connection expires by the existing heartbeat
  and Awareness' 30 s timeout. A client never publishes a userId: the server stamps it from the
  verified token.
- **Active / away** comes from the browser: tab hidden (Page Visibility) or no input for ~10 minutes →
  away; sent only on change.
- **Who sees it:** signed-in users of the same app. The server sends the current set on subscribe and
  changes as they happen (`presence` messages to the app's verified subscribers). No database writes.
- **Appear offline:** a per-user setting; a socket of a user who chose it is not counted.
- **Client:** `presence` module in the library (the socket's presence messages → a map), a hook
  `usePresence(userId)` → `'active' | 'away' | 'offline'`, and a themed UI primitive `UI.PresenceDot`
  (`ui/components/PresenceDot.{jsx,theme.js}`, via ThemeContext) that any component showing a user drops
  in. Generic: no pattern knowledge.
- **Sites without sync:** the socket is what carries presence; a site with sync off shows no dots (the
  hook answers `unknown`, and the dot draws nothing).

## Open questions

- Where "Appear offline" is stored: the auth user (one setting across sites) or per site.
- Multi-server deployments: an in-memory set needs a shared store (Redis / Postgres NOTIFY) when a site
  runs more than one dms-server. One server per site today; noted, not built.

## Phases

### Phase 1 — server
- [ ] Token on subscribe, verified; socket carries its user
- [ ] Per-app presence set (awareness-only, server-stamped userId), active/away, expiry
- [ ] `presence` snapshot on subscribe + change messages, to verified subscribers of the app only
- [ ] Tests: two users, tabs open/close, away, unverified socket ignored, another app's users invisible

### Phase 2 — client
- [ ] `presence` module, `usePresence`, idle/visibility detection, Appear offline
- [ ] `UI.PresenceDot` (themed) and its use in the user menu and permission editors

### Phase 3 — chat
- [ ] Dots on people and DM rows, message avatars, the New message picker

## Log

- **2026-11-18** — Planned with the owner: site-wide per-user presence, not per room.
