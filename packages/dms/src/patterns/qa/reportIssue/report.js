// Report an issue: whether the current page is one a QA install covers, and the tickets row a report
// becomes. No browser imports, so it's tested with plain data (tests/qaReportIssue.test.js); the
// widget (./ReportIssue.jsx) and its form (./ReportIssueForm.jsx) pass in their reads.
import { coveredSites, coversPattern, slugAllowed } from '../tracking.js'

// The install's two datasets a report needs: covered sites (read) and tickets (written). From its full
// settings for a user granted on it, else from the no-access stub's `qa.intake` (dms-server
// routes/dms/dms.route.js qaIntake), which carries just these two. Null when neither has both.
export function intakeRefs(install) {
  const { tickets, patterns } = install?.qa?.datasets || install?.qa?.intake || {}
  return tickets && patterns ? { tickets, patterns } : null
}

// The covering install, its covered-sites row and its intake refs for a page, or null. `installs`: the
// site's qa pattern rows (CMSContext.qaTracking.installs). `patternKeys`: the ways a covered-sites row
// can name the page's pattern (id, name, instance). `loadSites(install, refs)` → that install's
// covered-sites rows.
export async function findCoveringSite({ installs = [], patternKeys = [], slug = '', loadSites }) {
  for (const install of installs) {
    const refs = intakeRefs(install)
    if (!refs) continue
    const site = coveredSites(await loadSites(install, refs)).find((s) => coversPattern(s, patternKeys))
    if (site && slugAllowed(site, slug)) return { install, site, refs }
  }
  return null
}

// What the report is about. An idea files with severity Feature (ticketRecord's severity list keeps
// it for TransportNY's form; a separate kind column may replace it later).
export const REPORT_KINDS = [
  { value: 'problem', label: "Something's wrong" },
  { value: 'idea', label: 'An idea' },
]

// How much a problem gets in the way, in the reporter's words, and the severity it files as.
export const REPORT_SEVERITIES = [
  { value: 'Blocker', label: "I can't use the page" },
  { value: 'Major', label: 'Something important is wrong' },
  { value: 'Minor', label: 'A small problem' },
  { value: 'Polish', label: 'It looks off' },
]
export const DEFAULT_REPORT_SEVERITY = 'Minor'

// The row's create-time fills, in the column shape applyCreateDefaults takes
// (page/components/sections/components/dataWrapper/getData.js): the same ones Page QA's New ticket
// form sets (pages/pageQa.js), plus the reporter's email in its own column.
export const REPORT_DEFAULTS = [
  { name: 'ticket_id', autoNumber: true, autoNumberStart: 101 },
  { name: 'status', defaultValue: 'Triage' },
  { name: 'source', defaultValue: 'client' },
  { name: 'reporter', defaultFn: 'user' },
  { name: 'reporter_email', defaultFn: 'user' },
  { name: 'opened', defaultFn: 'now' },
  { name: 'updated', defaultFn: 'now' },
]

// The tickets row for a report, before REPORT_DEFAULTS. Keyed to the page the way track-on-publish
// keys its pages row (`<surface>:<slug>`, tracking.js trackedPageRow), so the ticket lands on that
// page in Page QA. `env`: what the browser can tell about where the report was made.
export function reportRow({ kind = 'problem', severity, title = '', description = '', site, page, env }) {
  const slug = page?.url_slug || ''
  return {
    title: title.trim(),
    description: description.trim(),
    severity: kind === 'idea' ? 'Feature' : (severity || DEFAULT_REPORT_SEVERITY),
    page_key: `${site.surface}:${slug}`,
    surface: site.surface,
    page_route: `/${slug}`,
    page_name: page?.title || slug,
    ...(env ? { env: JSON.stringify(env) } : {}),
  }
}

// The tickets dataset as a write format (apiUpdate's config.format, as track-on-publish writes the
// pages dataset) and as a source (applyCreateDefaults' externalSource, as the QA pages bind it).
export const ticketsFormat = (app, ref) => ({
  app, type: `${ref.slug}|${ref.view_id}:data`, isDms: true, source_id: ref.source_id, view_id: ref.view_id, env: `${app}+${ref.slug}`,
})
export const ticketsSource = (app, ref) => ({
  isDms: true, app, type: ref.slug, source_id: ref.source_id, view_id: ref.view_id,
})
