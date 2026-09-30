import { DEFAULT_STATUSES, OUTCOMES } from './ticketRecord'

// The datasets each QA install owns, as internal (DMS) datasets. An install's copy of
// dataset `key` is named `<install>_<key>`: the server finds a dataset by that name
// (newest source with it, app-wide), so no two installs may share one.
//
// Tickets, pages, stories and patterns keep TransportNY's control-room columns exactly
// as stored in its `sitemgmt_*` sources, so its data can be copied in unchanged. New
// columns are only ever appended.

// Site Management — Tickets — source 2184923, as stored 2026-09-30
const TNY_TICKETS = [
  {"name": "ticket_id", "display_name": "Ticket #", "type": "number", "options": null, "required": false},
  {"name": "title", "display_name": "Title", "type": "text", "options": null, "required": false},
  {"name": "page_key", "display_name": "Page Key", "type": "text", "options": null, "required": false},
  {"name": "severity", "display_name": "Severity", "type": "select", "options": [{"label": "Blocker", "value": "Blocker"}, {"label": "Major", "value": "Major"}, {"label": "Minor", "value": "Minor"}, {"label": "Polish", "value": "Polish"}], "required": false},
  {"name": "priority", "display_name": "Priority", "type": "select", "options": [{"label": "Now", "value": "Now"}, {"label": "Next", "value": "Next"}, {"label": "Later", "value": "Later"}], "required": false},
  {"name": "status", "display_name": "Status", "type": "select", "options": [{"label": "Triage", "value": "Triage"}, {"label": "In progress", "value": "In progress"}, {"label": "In review", "value": "In review"}, {"label": "Needs decision", "value": "Needs decision"}, {"label": "Needs data", "value": "Needs data"}, {"label": "Resolved", "value": "Resolved"}, {"label": "Closed", "value": "Closed"}], "required": false},
  {"name": "assignee", "display_name": "Assignee", "type": "text", "options": null, "required": false},
  {"name": "reporter", "display_name": "Reporter", "type": "text", "options": null, "required": false},
  {"name": "opened", "display_name": "Opened", "type": "text", "options": null, "required": false},
  {"name": "updated", "display_name": "Updated", "type": "text", "options": null, "required": false},
  {"name": "labels", "display_name": "Labels (json)", "type": "text", "options": null, "required": false},
  {"name": "description", "display_name": "Description", "type": "textarea", "options": null, "required": false},
  {"name": "steps", "display_name": "Steps", "type": "textarea", "options": null, "required": false},
  {"name": "expected", "display_name": "Expected", "type": "textarea", "options": null, "required": false},
  {"name": "actual", "display_name": "Actual", "type": "textarea", "options": null, "required": false},
  {"name": "env", "display_name": "Environment (json)", "type": "textarea", "options": null, "required": false},
  {"name": "comments", "display_name": "Comments (json)", "type": "textarea", "options": null, "required": false},
  {"name": "source", "display_name": "Source", "type": "select", "required": false, "options": [{"label": "AI", "value": "ai"}, {"label": "Dev", "value": "dev"}, {"label": "Client", "value": "client"}, {"label": "QA", "value": "qa"}]},
  {"name": "page_name", "display_name": "Page", "type": "text"},
  {"name": "page_route", "display_name": "Page route", "type": "text"},
  {"name": "page_stage", "display_name": "Page stage", "type": "text"},
  {"name": "surface", "display_name": "Surface", "type": "text"},
  {"name": "suggested_solution", "display_name": "Suggested solution", "type": "textarea"},
  {"name": "category", "display_name": "Category", "type": "select", "options": [{"label": "bug", "value": "bug"}, {"label": "style", "value": "style"}, {"label": "data", "value": "data"}, {"label": "content", "value": "content"}, {"label": "enhancement", "value": "enhancement"}]},
  {"name": "resolution", "display_name": "Resolution", "type": "textarea"},
  {"name": "resolved_date", "display_name": "Resolved", "type": "text"},
  {"name": "duplicate_of", "display_name": "Duplicate of", "type": "text"},
  {"name": "effort", "display_name": "Effort", "type": "select", "options": [{"label": "S", "value": "S"}, {"label": "M", "value": "M"}, {"label": "L", "value": "L"}]},
  {"name": "verified", "display_name": "Verified", "type": "text"},
  {"name": "verified_by", "display_name": "Verified by", "type": "text"},
  {"name": "screenshot", "display_name": "Screenshot", "type": "text"},
]

// Site Management — Pages — source 2184889, as stored 2026-09-30
const TNY_PAGES = [
  {"name": "page_key", "display_name": "Page Key", "type": "text", "options": null, "required": false},
  {"name": "surface", "display_name": "Surface Key", "type": "text", "options": null, "required": false},
  {"name": "surface_label", "display_name": "Surface", "type": "text", "options": null, "required": false},
  {"name": "name", "display_name": "Page Name", "type": "text", "options": null, "required": false},
  {"name": "route", "display_name": "Route", "type": "text", "options": null, "required": false},
  {"name": "build", "display_name": "Build", "type": "select", "options": [{"label": "Not started", "value": "Not started"}, {"label": "In progress", "value": "In progress"}, {"label": "Built (draft)", "value": "Built (draft)"}, {"label": "Published", "value": "Published"}], "required": false},
  {"name": "qa", "display_name": "QA", "type": "select", "options": [{"label": "Needs QA", "value": "Needs QA"}, {"label": "In review", "value": "In review"}, {"label": "Changes requested", "value": "Changes requested"}, {"label": "Conditional sign-off", "value": "Conditional sign-off"}, {"label": "Approved", "value": "Approved"}], "required": false},
  {"name": "data", "display_name": "Data Binding", "type": "select", "options": [{"label": "Real", "value": "Real"}, {"label": "Partial", "value": "Partial"}, {"label": "Mock", "value": "Mock"}], "required": false},
  {"name": "owner", "display_name": "Owner", "type": "text", "options": null, "required": false},
  {"name": "updated", "display_name": "Updated", "type": "text", "options": null, "required": false},
  {"name": "open_bugs", "display_name": "Open Bugs", "type": "integer", "options": null, "required": false},
  {"name": "blockers", "display_name": "Blockers", "type": "integer", "options": null, "required": false},
  {"name": "majors", "display_name": "Majors", "type": "integer", "options": null, "required": false},
  {"name": "rag", "display_name": "RAG", "type": "select", "options": [{"label": "green", "value": "green"}, {"label": "amber", "value": "amber"}, {"label": "red", "value": "red"}], "required": false},
  {"name": "ai_reviewed", "display_name": "AI Reviewed", "type": "text", "options": null, "required": false},
  {"name": "dev_ready", "display_name": "Dev Ready", "type": "text", "options": null, "required": false},
  {"name": "client_approved", "display_name": "Client Approved", "type": "text", "options": null, "required": false},
  {"name": "stage", "display_name": "Stage", "type": "select", "required": false, "options": [{"label": "Proposed", "value": "Proposed"}, {"label": "Design", "value": "Design"}, {"label": "Implemented", "value": "Implemented"}, {"label": "QA", "value": "QA"}, {"label": "Dev Acceptance", "value": "Dev Acceptance"}, {"label": "Client Acceptance", "value": "Client Acceptance"}]},
  {"name": "next_step", "display_name": "Next step", "type": "text", "options": null, "required": false},
  {"name": "stage_order", "display_name": "Stage order", "type": "integer", "options": null, "required": false},
  {"name": "url", "display_name": "Live URL", "type": "text"},
  {"name": "description", "display_name": "Description", "type": "text"},
  {"name": "design_file", "display_name": "Design file", "type": "text"},
  {"name": "design_html", "display_name": "Design HTML", "type": "text"},
]

// Site Management — Stories — source 2186440, as stored 2026-09-30
const TNY_STORIES = [
  {"name": "page_key", "display_name": "Page", "type": "text"},
  {"name": "story", "display_name": "User story", "type": "text"},
  {"name": "stage", "display_name": "Stage", "type": "select", "options": [{"label": "proposed", "value": "proposed"}, {"label": "accepted", "value": "accepted"}, {"label": "verified", "value": "verified"}]},
  {"name": "source", "display_name": "Source", "type": "text"},
  {"name": "sort_order", "display_name": "Order", "type": "integer"},
]

// Site Management — Patterns — source 2186148, as stored 2026-09-30
const TNY_PATTERNS = [
  {"name": "app", "display_name": "App", "type": "text"},
  {"name": "pattern", "display_name": "Pattern", "type": "text"},
  {"name": "surface", "display_name": "Surface", "type": "text"},
  {"name": "surface_label", "display_name": "Label", "type": "text"},
  {"name": "sort_order", "display_name": "Order", "type": "integer"},
  {"name": "enabled", "display_name": "Enabled", "type": "text"},
  {"name": "subdomain", "display_name": "Subdomain", "type": "text"},
  {"name": "base_url", "display_name": "Base URL", "type": "text"},
  {"name": "include_slugs", "display_name": "Include slugs (allowlist)", "type": "text", "description": "Comma-separated page slugs to enrol. EMPTY = inventory every live page of this pattern (legacy behaviour). Non-empty = enrol ONLY these slugs."},
]
const option = value => ({ label: value, value })
const column = (name, display_name, type = 'text', extra = {}) => ({ name, display_name, type, required: false, ...extra })
const withOptions = (attributes, name, options) => attributes.map(a => (a.name === name ? { ...a, options } : a))

// The old row id of a copied TransportNY row, kept so links between rows can be rewritten.
const LEGACY_ID = column('legacy_id', 'Legacy id')

const TICKET_ATTRIBUTES = [
  ...withOptions(
    withOptions(TNY_TICKETS, 'status', DEFAULT_STATUSES.map(s => option(s.value))),
    // TransportNY's Report-an-issue form has offered "Feature" since 2026-09-29; its stored
    // options predate it.
    'severity', [...TNY_TICKETS.find(a => a.name === 'severity').options, option('Feature')],
  ),
  column('outcome', 'Outcome', 'select', { options: OUTCOMES.map(option) }),
  column('reporter_name', 'Reporter name'),
  column('reporter_email', 'Reporter email'),
  LEGACY_ID,
]

// One row per changed field of a ticket. Created with the ticket record; phase 3 of
// planning/tasks/current/qa-pattern-type.md decides how rows get written.
const HISTORY_ATTRIBUTES = [
  column('row_id', 'Row', 'number'),
  column('field', 'Field'),
  column('old_value', 'Old value'),
  column('new_value', 'New value'),
  column('user_id', 'User id', 'number'),
  column('user_email', 'User email'),
  column('at', 'At'),
  column('via', 'Via', 'select', { options: ['ui', 'cli', 'agent'].map(option) }),
]

export const QA_DATASETS = [
  { key: 'tickets',  name: 'Tickets',           attributes: TICKET_ATTRIBUTES },
  { key: 'pages',    name: 'Pages',             attributes: [...TNY_PAGES, LEGACY_ID] },
  { key: 'stories',  name: 'Stories',           attributes: [...TNY_STORIES, LEGACY_ID] },
  { key: 'patterns', name: 'Covered sub-sites', attributes: [...TNY_PATTERNS, LEGACY_ID] },
  { key: 'history',  name: 'Change history',    attributes: HISTORY_ATTRIBUTES },
]

export const qaDatasetSlug = (instance, key) => `${instance}_${key}`
