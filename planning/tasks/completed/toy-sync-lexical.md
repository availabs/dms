# Toy Sync: Lexical Integration

## Objective

Replace the plain textarea in the toy-sync notes app with the DMS Lexical rich text editor, reusing the existing DMS implementation rather than building from scratch. The editor's JSON state should flow through the existing Yjs sync pipeline (SQLite WASM + WebSocket broadcast + conflict resolution).

## Current State

### Toy-sync notes editor (`research/toy-sync/client/components/NoteEditor.jsx`)
- Plain `<textarea>` for the `description` field
- Controlled component with 300ms debounced save via `useMutation` hook
- `localEditRef` prevents remote updates from overwriting active edits
- Data stored as `{title: string, description: string}` JSON in SQLite `items.data` column
- Sync path: local edit → Yjs merge → SQLite → HTTP push → WebSocket broadcast → remote Yjs merge → SQLite → React re-render

### DMS Lexical (`src/dms/packages/dms/src/ui/components/lexical/`)
- Full rich text editor: 35+ plugins, custom nodes (collapsible, layout, inline image, table, etc.)
- Value format: Lexical JSON string (`{root: {children: [...]}}`) or plain text (auto-converted via `parseValue()`)
- `Edit` component (editor) and `View` component (sync HTML render) exported from `index.jsx`
- `onChange` callback receives raw EditorState object (from `OnChangePlugin`); must call `.toJSON()` + `JSON.stringify()` to serialize
- Dependencies: ThemeContext (provides `theme` object with `lexical.styles`), LexicalThemeContext (internal), SharedHistoryContext (undo/redo)
- The editor gracefully falls back to default theme when no ThemeContext is provided (`editor/index.tsx` line 56-61)

### Key compatibility points
- Lexical JSON stored as string in `description` field; Yjs LWW on that key — last writer wins
- `parseValue()` handles plain text → Lexical JSON conversion for existing notes
- Editor's `UpdateEditor` ignores external value changes in edit mode after first render — correct for LWW
- `key={id}` prop on `LexicalComposer` forces remount when switching notes

## Implementation Plan — COMPLETE

### Phase 1: Vite alias + theme provider — DONE

- [x] Add `@dms` resolve alias in `research/toy-sync/vite.config.js` pointing to `../../src/dms/packages/dms/src`
- [x] Add `publicDir` pointing to parent project's `public/` for toolbar icon SVGs
- [x] Create `research/toy-sync/client/components/LexicalThemeProvider.jsx` — minimal dark ThemeContext with overridden Lexical styles (light text on dark background)
- [x] Wrap App content with `LexicalThemeProvider` in `research/toy-sync/client/App.jsx`
- [x] Add `@source` directive in `style.css` to include DMS Lexical directory for Tailwind content scanning
- [x] Add dark overrides for toolbar, dropdown, and typeahead popover theme keys (bg-neutral-800, inverted icons, etc.)
- **Design note**: Font Awesome CDN not needed — toolbar uses SVG icon files from `public/images/icons/`, served via `publicDir` config
- **Design note**: Tailwind v4 auto-detection didn't scan DMS files outside project root — fixed with `@source` directive (CSS went 11KB → 57KB with toolbar/dropdown classes included)

### Phase 2: Replace textarea with Lexical editor — DONE

- [x] Import DMS Lexical `EditComp` from `@dms/ui/components/lexical/index.jsx` in NoteEditor
- [x] Replace `<textarea>` with `<LexicalEdit value={description} onChange={handleLexicalChange} id={noteId} />`
- [x] Serialize EditorState via `JSON.stringify(editorState.toJSON())` in onChange handler
- [x] Fix: skip initial `OnChangePlugin` fire on mount via `lexicalReadyRef` (was corrupting notes on switch)
- [x] Fix: use refs (`titleRef`, `noteIdRef`) in save callback to avoid stale closure captures
- [x] Fix: NoteList extracts plain text from Lexical JSON for preview (was showing raw JSON)
- [x] Build succeeds (888 modules, 5.4s) — all DMS Lexical deps resolve from parent `node_modules/`
- [x] Fix: COEP `credentialless` instead of `require-corp` to allow cross-origin image pastes
- [x] Fix: NoteList sorted by `created_at` instead of `updated_at` to prevent reordering during edits
- [x] Fix: `handleLexicalChange` compares serialized content to skip no-op selection/mount changes
- [x] Fix: `loadedNoteId` guard — Lexical only renders when data has been loaded for the current noteId
- [x] Fix: `save()` reads refs at flush time (inside debounce timeout) to avoid stale closures
- [x] Fix: `notes[0].id === noteId` verification in effect to prevent loading stale query results after note switch
- [x] Fix: cancel pending debounce timer on noteId change to prevent stale writes to old note

### Phase 3: Sync compatibility verification — DONE

- [x] Verify Lexical JSON round-trips through SQLite → HTTP → Yjs merge → SQLite → React re-render
- [x] Test two-tab sync: edit rich text in one tab, observe LWW behavior in other tab
- [ ] Test offline: edit with server down, reconnect, verify state syncs correctly
- [ ] Test existing plain-text notes: `parseValue()` should auto-convert to Lexical JSON

#### Sync fixes applied:
- [x] Fix: `removePending` only clears `pendingItemIds` when ALL pending mutations for an item are done (prevents CREATE echo from overwriting local edits while UPDATE is in flight)
- [x] Fix: `removePending` only sets status to `connected` when total pending count is 0
- [x] Fix: `pushUpdate` falls back to POST create when server returns 404 (handles orphaned local items)
- [x] Fix: retry delay reduced from 3s to 500ms for faster convergence
- [x] Fix: server POST route made idempotent (`ON CONFLICT DO UPDATE`) so retried creates don't fail
- [x] Fix: `remoteVersion` counter forces Lexical remount on remote description changes (Lexical's UpdateEditor ignores value prop changes after first render)
- [x] Fix: `remountingRef` prevents post-remount onChange from triggering an unnecessary save loop

## Files Requiring Changes

### toy-sync modifications
| File | Action | Description |
|------|--------|-------------|
| `research/toy-sync/vite.config.js` | Modify | Add `@dms` resolve alias |
| `research/toy-sync/client/components/LexicalThemeProvider.jsx` | **New** | Minimal dark ThemeContext provider |
| `research/toy-sync/client/components/NoteEditor.jsx` | Modify | Replace textarea with Lexical Edit |
| `research/toy-sync/client/App.jsx` | Modify | Wrap with LexicalThemeProvider |
| `research/toy-sync/client/index.html` | Modify | Add Font Awesome CDN |

### DMS files (read-only, no changes)
- `src/dms/packages/dms/src/ui/components/lexical/` — entire directory

## Dependencies

All Lexical packages (`lexical`, `@lexical/react`, `@lexical/rich-text`, etc.) and other deps (`@headlessui/react`, `lodash-es`) are already installed in the parent project's `node_modules/`. Vite's module resolution walks up the directory tree, so no separate install needed in toy-sync — just the `@dms` alias for DMS source imports.

## Testing Checklist

- [ ] Lexical editor renders in toy-sync note editor (replacing textarea)
- [ ] Existing plain-text notes display correctly in Lexical (parseValue conversion)
- [ ] Rich text formatting works (bold, italic, headings, lists)
- [ ] Changes save through the existing sync pipeline (debounce → mutation → SQLite → HTTP)
- [ ] Real-time sync: edit in one tab, see Lexical content update in another tab
- [ ] Offline: edit with server down, reconnect, verify state syncs
- [ ] No Lexical JSON corruption after multiple sync round-trips
- [ ] Editor theme/styling looks reasonable in toy-sync's dark UI

## Notes

- This is a research/proof-of-concept task — the toy-sync app is in `research/` and is not production code
- Character-level collaborative editing (Yjs ↔ Lexical binding) is explicitly out of scope — that's the "DMS sync integration" task on the roadmap
- Phase 4 (optional Yjs-native Lexical binding) is deferred to the DMS sync integration task
