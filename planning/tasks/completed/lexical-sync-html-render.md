# Lexical Sync HTML Render

## Objective

Eliminate layout jitter in the Lexical HTML view by making HTML generation synchronous in the browser. The current async `useEffect` + `useState` pattern causes a visible two-paint cycle: empty first, content second. This is imperceptible with 1-3 Lexical views (pages) but very noticeable with dozens (DatasetsList SourceThumbs).

## Problem

The View component in `lexical/index.jsx` renders Lexical content via:

```jsx
const [html, setHtml] = React.useState('')

React.useEffect(() => {
    async function loadHtml() {
        setHtml(await getHtml(parseValue(value), LexicalTheme, resolvedTheme?.Icons));
    }
    loadHtml()
}, [value, LexicalTheme]);
```

1. **First render**: `html` is `''` — cards render with empty description area
2. **Effect fires**: `getHtml()` resolves, `setHtml` triggers re-render — descriptions pop in, shifting layout

`getHtml()` in `ssr.ts` is async because it uses `editor.update()` (which schedules asynchronously) wrapped in a `Promise`. But in the browser, this work can be done synchronously using `editorState.read()` instead — it runs the callback immediately, and `$generateHtmlFromNodes` is a read-only operation (creates detached DOM elements, doesn't modify editor state).

## Solution

1. Add `getHtmlSync()` to `ssr.ts` — browser-only synchronous version using `editorState.read()`
2. Change View component from `useEffect + useState` to `useMemo` with `getHtmlSync`
3. Keep async `getHtml()` for SSR compatibility (needs linkedom setup)

## Files

| File | Action |
|------|--------|
| `ui/components/lexical/ssr.ts` | Add `getHtmlSync()` export |
| `ui/components/lexical/index.jsx` | Change View to use `useMemo` + `getHtmlSync` |

## Implementation

### Phase 1: Sync HTML render — DONE

#### Step 1: Add `getHtmlSync` to `ssr.ts`

Uses `editorState.read()` instead of `editor.update()`. Synchronous — returns string directly, no Promise.

```ts
export function getHtmlSync(serializedEditorState: string, flatTheme?: object, icons?: object): string {
    if (!serializedEditorState) return '';

    try {
        const editor = createHeadlessEditor({ namespace: 'html-renderer', flatTheme, icons });
        const editorState = editor.parseEditorState(serializedEditorState);
        editor.setEditorState(editorState);

        let html = '';
        editorState.read(() => {
            html = $generateHtmlFromNodes(editor, null);
        });
        return html;
    } catch (e) {
        console.error('Error generating HTML:', e);
        return '';
    }
}
```

- [x] Add `getHtmlSync` export to `ssr.ts`

#### Step 2: Update View component in `index.jsx`

Replace `useEffect + useState` with `useMemo`:

```jsx
const View = React.memo(({
    value, bgColor, id, theme, styleName
}) => {
    const { theme: contextTheme } = React.useContext(ThemeContext) || {};
    const resolvedTheme = theme || contextTheme;
    const LexicalTheme = getLexicalTheme(resolvedTheme, styleName);

    const html = React.useMemo(
        () => getHtmlSync(parseValue(value), LexicalTheme, resolvedTheme?.Icons),
        [value, LexicalTheme]
    );

    return (
        <div className={`${LexicalTheme.editorShell}`}>
            <div className={LexicalTheme.editorViewContainer || ''} style={bgColor ? { backgroundColor: bgColor } : undefined}>
                <div className={LexicalTheme.viewScroller || ''}>
                    <div className={`${LexicalTheme.contentEditable || ''} w-full`}>
                        <div dangerouslySetInnerHTML={{ __html: html }}></div>
                    </div>
                </div>
            </div>
        </div>
    );
});
```

- [x] Import `getHtmlSync` instead of `getHtml`
- [x] Replace `useState` + `useEffect` with `useMemo`
- [x] Remove unused `containerRef`, `noop`, commented-out collapsible handler effect

#### Step 3: Build + verify

- [x] `npm run build` passes (23.77s)

## Verification

- [ ] DatasetsList page: no jitter when source card descriptions render
- [ ] DatasetsList page: descriptions still render correctly (same HTML output)
- [ ] Page pattern Lexical sections: still render correctly
- [ ] Edit mode: unaffected (uses Editor component, not View)
- [ ] `npm run build` passes
