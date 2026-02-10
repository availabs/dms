# Lexical Plaintext Normalization

## Objective

Move the plaintext-to-Lexical-JSON conversion logic up from the editor (`editor/index.tsx`) to the shared wrapper (`lexical/index.jsx`) so both the Edit path and the HTML render View path can handle plaintext input without duplicating code.

## Problem

The Lexical column type has two render paths:

1. **Edit path**: `Edit` → `parseValue(value)` → `Editor` (editor/index.tsx) → `UpdateEditor`
2. **View path**: `View` → `parseValue(value)` → `getHtml(parseValue(value), ...)` → `editor.parseEditorState()`

`parseValue()` in `lexical/index.jsx` normalizes the value type (object → JSON string, null → null, string → pass through) but does **not** convert plaintext to Lexical JSON format. It returns plaintext strings as-is.

- The **editor** handles this fine — `UpdateEditor` has `isLexicalJSON()` check and a fallback branch that uses `$createParagraphNode()` + `$createTextNode(value)` to create editor state from plaintext.
- The **HTML view** does NOT handle this — `getHtml()` in `ssr.ts` passes the value directly to `editor.parseEditorState()`, which throws on non-JSON input. Plaintext values silently fail to render.

## Current Code

### `lexical/index.jsx` — `parseValue()` (lines 7-29)

Normalizes types but doesn't convert plaintext:
```js
function parseValue(value) {
    if (typeof value === 'undefined' || value === null) return null;
    if (typeof value === "object") return JSON.stringify(value);
    if (typeof value === "string") {
        try {
            const parsed = JSON.parse(value);
            if (parsed?.root) return value; // valid Lexical JSON
            else return value; // ← returns non-Lexical JSON as-is
        } catch {
            return value; // ← returns plaintext as-is
        }
    }
    return null;
}
```

### `editor/index.tsx` — `isLexicalJSON()` + `UpdateEditor` (lines 26-144)

Has the conversion logic that should be shared:
```js
function isLexicalJSON(str) {
    try {
        const parsed = JSON.parse(str);
        return !!parsed?.root && parsed.root.children?.length > 0;
    } catch {
        return false;
    }
}

// In UpdateEditor useEffect:
if (isLexicalJSON(value)) {
    const newEditorState = editor.parseEditorState(value);
    queueMicrotask(() => { editor.setEditorState(newEditorState); });
} else {
    editor.update(() => {
        const root = $getRoot();
        root.clear();
        const paragraph = $createParagraphNode();
        paragraph.append($createTextNode(value));
        root.append(paragraph);
    });
}
```

### `ssr.ts` — `getHtml()` (line 96)

Assumes valid Lexical JSON:
```ts
editor.setEditorState(editor.parseEditorState(serializedEditorState));
// ↑ throws if serializedEditorState is plaintext
```

## Solution

Make `parseValue()` convert plaintext strings into valid Lexical JSON so both downstream consumers (Editor and getHtml) always receive parseable input.

The Lexical JSON format for a simple text paragraph:
```json
{
    "root": {
        "children": [{
            "children": [{
                "detail": 0,
                "format": 0,
                "mode": "normal",
                "style": "",
                "text": "<plaintext value>",
                "type": "text",
                "version": 1
            }],
            "direction": "ltr",
            "format": "",
            "indent": 0,
            "type": "paragraph",
            "version": 1
        }],
        "direction": "ltr",
        "format": "",
        "indent": 0,
        "type": "root",
        "version": 1
    }
}
```

## Files

| File | Action |
|------|--------|
| `ui/components/lexical/index.jsx` | Update `parseValue()` to convert plaintext → Lexical JSON |
| `ui/components/lexical/editor/index.tsx` | Remove redundant `isLexicalJSON()` and plaintext branch from `UpdateEditor` — keep as safety fallback only |

## Implementation

### Phase 1: Consolidate plaintext conversion — DONE

#### Step 1: Update `parseValue()` in `lexical/index.jsx`

Replace the current `parseValue()` with one that detects plaintext and wraps it in valid Lexical JSON:

```js
function isLexicalJSON(value) {
    try {
        const parsed = typeof value === 'string' ? JSON.parse(value) : value;
        return !!parsed?.root && parsed.root.children?.length > 0;
    } catch {
        return false;
    }
}

function textToLexicalJSON(text) {
    return JSON.stringify({
        root: {
            children: [{
                children: [{
                    detail: 0, format: 0, mode: "normal", style: "",
                    text: text || '', type: "text", version: 1
                }],
                direction: "ltr", format: "", indent: 0,
                type: "paragraph", version: 1,
            }],
            direction: "ltr", format: "", indent: 0,
            type: "root", version: 1,
        }
    });
}

function parseValue(value) {
    if (typeof value === 'undefined' || value === null) return null;
    if (typeof value === "object") {
        if (value?.root) return JSON.stringify(value);
        // non-Lexical object — can't convert
        return null;
    }
    if (typeof value === "string") {
        if (!value.trim()) return null;
        if (isLexicalJSON(value)) return value;
        return textToLexicalJSON(value);
    }
    return null;
}
```

- [x] `parseValue()` returns valid Lexical JSON or null — never raw plaintext
- [x] `isLexicalJSON()` and `textToLexicalJSON()` defined as module-level helpers

#### Step 2: Simplify `UpdateEditor` in `editor/index.tsx`

Keep `isLexicalJSON` as a safety check but the plaintext branch should now be unreachable since `parseValue` normalizes everything upstream. Keep it as a defensive fallback.

- [x] No changes needed — the existing code still works, the plaintext branch just becomes a dead-code safety net

#### Step 3: Build + verify

- [x] `npm run build` passes

## Verification

- [ ] Source descriptions (plaintext) render in the DatasetsList HTML view
- [ ] Lexical JSON content still renders correctly in both Edit and View
- [ ] Null/empty values don't crash either path
- [ ] `npm run build` passes
