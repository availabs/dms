# Task: DMS MCP Server — Claude Tool for DMS Content Management

> **Progress tracking**: This document is the source of truth for implementation status. Update phase headers, checklists, and design notes as work is completed. See `planning/planning-rules.md` for details.

## Objective

Create an MCP (Model Context Protocol) server that gives Claude structured tools for reading, creating, editing, and updating DMS pages and sections. Users point Claude at a `.dmsrc`-configured site and can ask natural language questions ("what pages are in the playground?", "add a new section with a table of hazard types") — Claude calls the MCP tools to inspect and modify content.

The MCP server reuses the existing CLI modules (`client.js`, `config.js`, `utils/data.js`, `commands/`) directly via imports, not by shelling out to the `dms` binary. This avoids shell escaping problems (especially for nested Lexical JSON) and keeps responses structured.

## Background

### Why MCP Instead of Bash + CLI

The DMS CLI already works from the terminal, but using it through Claude's Bash tool has friction:

1. **Shell escaping**: Section data contains JSON-within-JSON (Lexical `element-data` is a JSON string inside a JSON object). Passing this through shell arguments is fragile.
2. **No structure**: Claude gets raw JSON stdout and must parse it. MCP tools return structured data that Claude can reason about directly.
3. **Multi-step operations**: Creating a section requires building Lexical JSON, creating the section, and attaching it to a page. An MCP tool can do this atomically.
4. **Context**: MCP tools can provide site-aware context (available patterns, page hierarchy, section types) that helps Claude make informed decisions.

### MCP Protocol Basics

MCP servers communicate over stdio using JSON-RPC. Claude Code discovers tools via the server's `registerTool()` calls. Each tool has a name, description, typed input schema (Zod), and an async handler that returns `{ content: [{ type: "text", text: "..." }] }`.

Configuration goes in `.mcp.json` (project scope, committed) or `~/.claude.json` (user scope):

```json
{
  "mcpServers": {
    "dms": {
      "type": "stdio",
      "command": "node",
      "args": ["src/dms/packages/dms/cli/mcp/server.js"],
      "env": {}
    }
  }
}
```

## Architecture

### Package Location

```
cli/
├── mcp/
│   ├── server.js          # MCP server entry point (stdio transport)
│   ├── tools/
│   │   ├── site.js        # Site info + pattern listing tools
│   │   ├── page.js        # Page CRUD tools
│   │   └── section.js     # Section CRUD tools (incl. Lexical builder)
│   └── helpers/
│       ├── config.js      # .dmsrc resolution for MCP context
│       ├── lexical.js     # Lexical JSON builder (text → editor state)
│       └── format.js      # Response formatting (structured → readable)
├── src/                   # (existing CLI modules — shared)
│   ├── client.js
│   ├── config.js
│   ├── commands/
│   └── utils/
```

The MCP server imports from `../src/` directly. It uses the same Falcor client and data helpers as the CLI commands.

### Configuration Resolution

The MCP server reads `.dmsrc` the same way the CLI does (via `../src/config.js`), using the project working directory. This means if Claude Code is launched from a directory with a `.dmsrc` file, the MCP server automatically knows the host, app, and type.

Alternatively, configuration can be passed via environment variables in the MCP config:

```json
{
  "mcpServers": {
    "dms": {
      "type": "stdio",
      "command": "node",
      "args": ["src/dms/packages/dms/cli/mcp/server.js"],
      "env": {
        "DMS_HOST": "https://graph.availabs.org",
        "DMS_APP": "mitigat-ny-prod",
        "DMS_TYPE": "prod"
      }
    }
  }
}
```

### Dependencies

- `@modelcontextprotocol/sdk` — MCP server framework
- `zod` — Input schema validation (required by MCP SDK)
- Existing CLI deps (lodash-es, react-router) via shared `../src/` imports

## Tool Design

### Tier 1: Read Tools (Site Awareness)

These let Claude understand what's in the site before making changes.

#### `dms_site_info`

Returns site overview: name, patterns with types/urls/page-counts.

**Input**: none (uses .dmsrc config)

**Output**: Site name, list of patterns with `{ id, name, pattern_type, base_url, subdomain, page_count }`.

**Implementation**: Calls `site.show()` and `site.patterns()` logic, enriched with page counts per pattern.

---

#### `dms_page_list`

List pages in a pattern with title, slug, parent, publish status.

**Input**:
- `pattern` (optional string) — Pattern name or ID. Defaults to first page-type pattern.
- `limit` (optional number, default 50)
- `offset` (optional number, default 0)

**Output**: Array of `{ id, title, url_slug, parent, index, published }`, total count.

**Implementation**: Reuses `page.list()` logic.

---

#### `dms_page_show`

Get page details including section summary.

**Input**:
- `page` (string) — Page ID or slug
- `pattern` (optional string) — Pattern name or ID
- `include_sections` (optional boolean, default true) — Whether to fetch section list

**Output**: Page fields + array of `{ id, title, element_type }` for each section.

**Implementation**: Combines `page.show()` + `section.list()` logic.

---

#### `dms_section_show`

Get full section content, with element-data parsed (not as escaped JSON string).

**Input**:
- `section_id` (string) — Section ID

**Output**: Section metadata + parsed element content. For lexical sections, the Lexical JSON is parsed and also a plain-text summary of the content (headings, paragraphs, lists extracted to readable form).

**Implementation**: `section.dump()` logic + element-data parsing + text extraction.

---

### Tier 2: Write Tools (Content Management)

#### `dms_page_create`

Create a new page.

**Input**:
- `title` (string) — Page title
- `slug` (optional string) — URL slug (auto-generated from title if omitted)
- `parent` (optional string) — Parent page ID or slug
- `pattern` (optional string) — Pattern name or ID

**Output**: Created page `{ id, title, url_slug }`.

**Implementation**: Reuses `page.create()` logic.

---

#### `dms_page_update`

Update page metadata (title, slug, index, custom data).

**Input**:
- `page` (string) — Page ID or slug
- `title` (optional string) — New title
- `slug` (optional string) — New slug
- `data` (optional object) — Arbitrary data fields to merge
- `pattern` (optional string) — Pattern name or ID

**Output**: Updated page confirmation.

**Implementation**: Reuses `page.update()` logic with read-modify-write for partial updates.

---

#### `dms_page_publish` / `dms_page_unpublish`

Publish or unpublish a page.

**Input**:
- `page` (string) — Page ID or slug
- `pattern` (optional string)

**Output**: Confirmation with new publish status.

---

#### `dms_page_delete`

Delete a page.

**Input**:
- `page` (string) — Page ID or slug
- `pattern` (optional string)

**Output**: Confirmation.

---

#### `dms_section_create`

Create a section and attach it to a page. This is the most complex tool because it handles Lexical JSON construction.

**Input**:
- `page` (string) — Page ID or slug to attach to
- `element_type` (string) — Section type: `"lexical"`, `"Card"`, `"Spreadsheet"`, `"Header"`, `"Graph"`, `"Selector"`
- `content` (optional object) — For lexical sections, structured content description (see below). For other types, raw element-data object.
- `raw_data` (optional object) — Full section data object (overrides element_type + content). For advanced use / restoring backups.
- `title` (optional string) — Section title
- `pattern` (optional string)

**Lexical `content` format** (simplified input that the tool converts to Lexical JSON):

```json
{
  "blocks": [
    { "type": "heading", "level": 1, "text": "Main Title" },
    { "type": "paragraph", "text": "Lorem ipsum dolor sit amet..." },
    { "type": "heading", "level": 2, "text": "Subtitle" },
    { "type": "paragraph", "text": "More text here." },
    { "type": "code", "language": "javascript", "text": "function hello() {\n  return 'world';\n}" },
    { "type": "quote", "text": "A notable quotation." },
    { "type": "list", "style": "bullet", "items": ["First item", "Second item", "Third item"] },
    { "type": "list", "style": "number", "items": ["Step one", "Step two", "Step three"] }
  ]
}
```

The tool internally converts this simplified format into full Lexical editor state JSON (with all the node metadata, directions, formats, etc.), wraps it in the `element-data` JSON string, constructs the `{ group, parent, element, trackingId }` envelope, and creates the section.

**Output**: `{ id, page_id, element_type, message }`.

**Implementation**: New Lexical builder in `mcp/helpers/lexical.js` converts simplified blocks → Lexical nodes. Then reuses `section.create()` plumbing.

---

#### `dms_section_update`

Update section content.

**Input**:
- `section_id` (string) — Section ID
- `content` (optional object) — Simplified Lexical content (same format as create). Replaces element-data.
- `raw_data` (optional object) — Full data merge (for non-lexical or advanced use)
- `set` (optional object) — Key-value pairs for read-modify-write partial update

**Output**: Confirmation.

**Implementation**: If `content` provided, builds Lexical JSON and does full element-data replacement. If `set` provided, does read-modify-write merge. If `raw_data`, sends as-is.

---

#### `dms_section_delete`

Delete a section and optionally detach from its page.

**Input**:
- `section_id` (string) — Section ID
- `page` (optional string) — Page to detach from

**Output**: Confirmation.

---

### Tier 3: Convenience Tools (Optional / Future)

These are nice-to-have but not essential for v1:

- `dms_page_reorder` — Reorder pages (set index values)
- `dms_section_reorder` — Reorder sections within a page
- `dms_page_tree` — Full site tree visualization
- `dms_pattern_show` — Pattern details including theme config
- `dms_search` — Search across pages/sections by text content

## Implementation Plan

### Phase 1: Foundation — MCP Server + Read Tools

**Goal**: Working MCP server that Claude can use to explore DMS content.

1. Add `@modelcontextprotocol/sdk` and `zod` to `cli/package.json`
2. Create `cli/mcp/server.js` — server entry point with stdio transport
3. Create `cli/mcp/helpers/config.js` — .dmsrc resolution wrapper for MCP context
4. Implement `dms_site_info` tool
5. Implement `dms_page_list` tool
6. Implement `dms_page_show` tool (with section summaries)
7. Implement `dms_section_show` tool (with parsed element-data and text extraction)
8. Create `.mcp.json` in project root
9. Test: start Claude Code, verify `/mcp` shows tools, ask "what pages are in the playground?"

### Phase 2: Page Write Tools

**Goal**: Claude can create and modify pages.

1. Implement `dms_page_create`
2. Implement `dms_page_update`
3. Implement `dms_page_publish` / `dms_page_unpublish`
4. Implement `dms_page_delete`
5. Test: ask Claude to "create a new page called Testing in the playground"

### Phase 3: Section Write Tools + Lexical Builder

**Goal**: Claude can create and edit rich text sections without manually constructing Lexical JSON.

1. Create `cli/mcp/helpers/lexical.js` — simplified block format → Lexical editor state converter
   - `heading(level, text)` → heading node with text child
   - `paragraph(text)` → paragraph node with text child (supports inline formatting markers)
   - `code(language, text)` → code node with code-highlight children + linebreaks
   - `quote(text)` → quote node
   - `list(style, items)` → list node with listitem children
   - `buildEditorState(blocks)` → complete `{ bgColor, text: { root: { children, ... } }, isCard }` object
   - `buildSectionData(pageId, patternRef, elementType, elementData)` → complete section envelope
2. Implement `dms_section_create` with Lexical builder integration
3. Implement `dms_section_update`
4. Implement `dms_section_delete`
5. Test: ask Claude to "add a section to Page 14 with a heading, some text, and a code example"

### Phase 4: Polish + Docs

1. Error handling and user-friendly error messages for all tools
2. Input validation edge cases (missing page, bad pattern, etc.)
3. Add tool descriptions that help Claude understand when to use each tool
4. Update `cli/CLAUDE.md` with MCP server section
5. Update `cli/docs/README.md` with MCP setup instructions
6. Create `cli/mcp/README.md` with tool reference

## Files Summary

**New files:**
- `cli/mcp/server.js` — MCP server entry point
- `cli/mcp/tools/site.js` — Site info + pattern listing tools
- `cli/mcp/tools/page.js` — Page CRUD tools
- `cli/mcp/tools/section.js` — Section CRUD tools
- `cli/mcp/helpers/config.js` — Config resolution for MCP context
- `cli/mcp/helpers/lexical.js` — Simplified content → Lexical JSON builder
- `cli/mcp/helpers/format.js` — Response formatting helpers
- `.mcp.json` — Project-level MCP configuration

**Modified files:**
- `cli/package.json` — Add MCP SDK + zod deps, add `mcp` script
- `cli/CLAUDE.md` — Add MCP server section
- `cli/docs/README.md` — Add MCP setup instructions

## Key Design Decisions

### Direct imports vs shelling out

The MCP server imports CLI modules directly (`../src/client.js`, `../src/utils/data.js`, etc.) rather than spawning `dms` as a subprocess. This:
- Avoids shell escaping nightmares for nested JSON
- Is faster (no process spawn per tool call)
- Returns structured data, not stdout strings
- Shares the Falcor client connection across tool calls within a session

### Simplified Lexical content format

Claude doesn't need to know the internal Lexical node structure. The MCP tool accepts a simple `blocks` array with `{ type, text, level, items, language }` objects and converts internally. This makes it natural for Claude to build content from natural language requests.

### Read-modify-write by default for updates

Section and page update tools always do read-modify-write (fetch current → merge → send). Since Claude can't see the full current state before deciding what to send, partial updates are the safe default. Raw replacement is available via `raw_data` for backup/restore scenarios.

### Text extraction for section show

When Claude reads a lexical section, the tool returns both the raw Lexical JSON and a plain-text extraction (headings as `# Title`, paragraphs as text, code as fenced blocks, etc.). This helps Claude understand the content without parsing Lexical internals.

## Testing Checklist

- [ ] MCP server starts and responds to tool discovery
- [ ] `/mcp` in Claude Code shows all registered tools
- [ ] `dms_site_info` returns correct site data
- [ ] `dms_page_list` returns pages for a pattern
- [ ] `dms_page_show` returns page with section summaries
- [ ] `dms_section_show` returns parsed Lexical content
- [ ] `dms_page_create` creates a page and returns its ID
- [ ] `dms_page_update` modifies title/slug without losing other data
- [ ] `dms_section_create` with Lexical content creates valid section
- [ ] `dms_section_create` content renders correctly in browser
- [ ] `dms_section_update` modifies content without losing metadata
- [ ] `dms_section_delete` removes section and detaches from page
- [ ] Error cases: missing page, bad pattern, invalid content, network error
- [ ] Claude can answer "what pages are in this site?" using tools
- [ ] Claude can create a page with sections from a natural language request
