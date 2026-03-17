# SSR Phase 2: Streaming Server-Side Rendering

## Objective

Upgrade the basic SSR from Phase 1 (`renderToString`) to streaming SSR (`renderToPipeableStream`). The server sends the HTML shell (nav, layout, CSS links) immediately and streams in page content as loaders resolve. This improves time-to-first-byte (TTFB) and perceived performance — users see the page skeleton instantly while data-heavy sections load.

## Scope

**In scope:**
- Replace `renderToString` with `renderToPipeableStream` in `entry-server.jsx`
- Template splitting: send `<head>` + opening HTML immediately, stream `<body>` content, close
- `Suspense` boundaries for section-level progressive rendering
- Error handling in streaming context (`onShellError`, `onError`)

**Out of scope:**
- React Server Components (Phase 3)
- New deployment infrastructure
- Changes to DMS component tree beyond adding `Suspense` boundaries

## Prerequisites

- Phase 1 (basic SSR) must be complete and working
- `entry-server.jsx`, `entry-client.jsx`, `server.js` exist from Phase 1
- Route generation and `window` fixes done in Phase 1

## Background

`renderToString` waits for the entire React tree to render before sending any HTML. For pages with multiple data-heavy sections (Spreadsheet, Card, Graph), this means the user sees nothing until ALL loaders complete. Streaming sends the shell immediately and progressively fills in content.

React Router's `StaticRouterProvider` supports streaming — the same component tree works with both `renderToString` and `renderToPipeableStream`. The change is in how we render and send the response, not in the component tree.

## Proposed Changes

### Phase 2A: Streaming Render in entry-server.jsx

Replace `renderToString` with `renderToPipeableStream`:

```jsx
import { renderToPipeableStream } from 'react-dom/server';

export function render(request, response, template) {
  const [headHtml, tailHtml] = template.split('<!--app-html-->');

  const { pipe, abort } = renderToPipeableStream(
    <StaticRouterProvider router={router} context={context} />,
    {
      onShellReady() {
        response.statusCode = context.statusCode;
        response.setHeader('Content-Type', 'text/html');
        response.write(headHtml);
        pipe(response);
      },
      onShellError(error) {
        // Shell failed — fall back to SPA
        response.statusCode = 500;
        response.send(template); // empty SPA shell
      },
      onAllReady() {
        // Optional: entire page is ready (useful for bots/crawlers)
      },
      onError(error) {
        console.error('SSR streaming error:', error);
      },
    }
  );

  // Timeout: abort streaming after N seconds, client takes over
  setTimeout(() => abort(), 10000);
}
```

**Key difference from Phase 1:** The `render()` function signature changes — instead of returning `{ html, status }`, it writes directly to the Express response stream. `server.js` must be updated accordingly.

### Phase 2B: Update server.js for Streaming

`server.js` must pass the Express response to `render()` instead of waiting for a return value:

```javascript
// Phase 1 (sync):
const { html, status } = await render(request);
res.status(status).send(template.replace('<!--app-html-->', html));

// Phase 2 (streaming):
render(request, res, template);
// render() writes directly to res — no await needed
```

The template is split before/after `<!--app-html-->`. The head portion (CSS links, meta tags) is sent immediately in `onShellReady`. The body streams as React renders.

### Phase 2C: Suspense Boundaries (Optional Enhancement)

Add `Suspense` boundaries around individual sections so they can stream independently:

```jsx
// In SectionView or SectionArray
<Suspense fallback={<SectionSkeleton />}>
  <DataWrapperSection section={section} />
</Suspense>
```

Without `Suspense`, the entire page waits for all sections. With `Suspense`, the layout and fast sections render first while slow sections show fallback UI until their data arrives.

**Candidates for Suspense boundaries:**
- Each section in `SectionArray` / `SectionGroup`
- Heavy components: Spreadsheet, Graph, Map
- NOT needed for: Rich Text (fast, no async data), static content

**Note:** `Suspense` boundaries are optional for Phase 2. Streaming already helps by sending the HTML shell before loaders complete. `Suspense` boundaries add finer-grained progressive rendering.

### Phase 2D: Bot/Crawler Handling

Search engine crawlers should receive the complete HTML (not a streaming response). Detect bots and use `onAllReady` instead of `onShellReady`:

```jsx
const isBot = /bot|crawler|spider|googlebot/i.test(request.headers.get('user-agent'));

renderToPipeableStream(app, {
  [isBot ? 'onAllReady' : 'onShellReady']() {
    response.statusCode = context.statusCode;
    pipe(response);
  },
});
```

This ensures crawlers get the full page for SEO, while real users get the fast streaming experience.

### Phase 2E: Testing

- [ ] TTFB: shell HTML arrives before loaders complete (compare with Phase 1 timing)
- [ ] Progressive rendering: page skeleton visible immediately, sections fill in as data loads
- [ ] Hydration: no mismatches after streaming completes
- [ ] Error handling: `onShellError` falls back to SPA shell
- [ ] Timeout: `abort()` fires after 10s, client takes over
- [ ] Bot detection: crawlers receive complete HTML
- [ ] SPA navigation: client-side navigation unaffected (streaming only applies to initial page load)
- [ ] `Suspense` boundaries (if added): individual sections stream independently

## Files Requiring Changes

| File | Change |
|------|--------|
| `src/entry-server.jsx` | Replace `renderToString` with `renderToPipeableStream`, change function signature |
| `server.js` | Pass response to `render()`, handle streaming lifecycle |
| Section components (optional) | Add `Suspense` boundaries around heavy sections |

## Key Technical Decisions

1. **`onShellReady` for users, `onAllReady` for bots**: Best of both worlds — fast for users, complete for SEO
2. **10-second timeout**: If streaming takes too long, abort and let the client render. Prevents hung connections.
3. **Template splitting**: Split `index.html` at `<!--app-html-->` to send head immediately
4. **Suspense is optional**: Streaming helps without Suspense boundaries. Add them incrementally for slow sections.
5. **Graceful degradation**: `onShellError` falls back to the empty SPA shell — same behavior as if SSR was disabled
