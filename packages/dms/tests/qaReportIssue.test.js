/**
 * Report an issue (phase 6): whether a page is one a QA install covers, and the tickets row a report
 * becomes, including the create-time fills Page QA's New ticket form uses.
 *
 * See planning/tasks/current/qa-pattern-type.md, "Phases 6–7".
 *
 * Run: npx vitest run packages/dms/tests/qaReportIssue.test.js --root src/dms
 */

import { describe, it, expect } from "vitest";
import {
  findCoveringSite, intakeRefs, reportRow, ticketsFormat, ticketsSource, REPORT_DEFAULTS, DEFAULT_REPORT_SEVERITY,
} from "../src/patterns/qa/reportIssue/report";
import { applyCreateDefaults } from "../src/patterns/page/components/sections/components/dataWrapper/getData";

const refs = (n) => ({
  tickets: { slug: `${n}_tickets`, source_id: 10, view_id: 11 },
  patterns: { slug: `${n}_patterns`, source_id: 12, view_id: 13 },
});
const install = (id, sites, datasets = refs(`i${id}`)) => ({ id, name: `QA ${id}`, qa: { datasets }, sites });
const site = (pattern, surface, over = {}) => ({ pattern, surface, surface_label: surface, enabled: 'yes', sort_order: 1, include_slugs: '', ...over });
const loadSites = (inst) => Promise.resolve(inst.sites);

describe("findCoveringSite", () => {
  const keys = [985070, 'MitigateNY_2025', 'mitigateny_2025'];

  it("finds the covered-sites row naming the page's pattern by id, name or instance", async () => {
    for (const pattern of ['985070', 'MitigateNY_2025', 'mitigateny_2025']) {
      const inst = install(1, [site('admin', 'admin'), site(pattern, 'shmp')]);
      const found = await findCoveringSite({ installs: [inst], patternKeys: keys, slug: 'home', loadSites });
      expect(found?.site.surface).toBe('shmp');
      expect(found?.install).toBe(inst);
    }
  });

  it("is null when no install covers the pattern", async () => {
    const found = await findCoveringSite({ installs: [install(1, [site('admin', 'admin')])], patternKeys: keys, slug: 'home', loadSites });
    expect(found).toBeNull();
  });

  it("ignores a switched-off site", async () => {
    const inst = install(1, [site('mitigateny_2025', 'shmp', { enabled: 'no' })]);
    expect(await findCoveringSite({ installs: [inst], patternKeys: keys, slug: 'home', loadSites })).toBeNull();
  });

  it("respects a site's page limit", async () => {
    const inst = install(1, [site('mitigateny_2025', 'shmp', { include_slugs: 'about, home' })]);
    expect((await findCoveringSite({ installs: [inst], patternKeys: keys, slug: 'home', loadSites }))?.site.surface).toBe('shmp');
    expect(await findCoveringSite({ installs: [inst], patternKeys: keys, slug: 'other', loadSites })).toBeNull();
  });

  it("skips an install whose settings this user can't read, without reading it", async () => {
    const reads = [];
    const stub = { id: 1, name: 'QA', no_access: true };
    const readable = install(2, [site('mitigateny_2025', 'shmp')]);
    const found = await findCoveringSite({
      installs: [stub, readable], patternKeys: keys, slug: 'home',
      loadSites: (i) => { reads.push(i.id); return loadSites(i) },
    });
    expect(found?.install).toBe(readable);
    expect(reads).toEqual([2]);
  });

  it("files from a no-access stub through its intake refs (a user not granted on the install)", async () => {
    const reads = [];
    const intake = refs('stub');
    const stub = { id: 3, name: 'QA', no_access: true, qa: { intake }, sites: [site('mitigateny_2025', 'shmp')] };
    const found = await findCoveringSite({
      installs: [stub], patternKeys: keys, slug: 'home',
      loadSites: (i, r) => { reads.push(r.patterns.slug); return loadSites(i) },
    });
    expect(found?.site.surface).toBe('shmp');
    expect(found?.refs).toEqual(intake);
    expect(reads).toEqual(['stub_patterns']);
  });

  it("prefers the full settings over intake refs", async () => {
    const inst = { ...install(4, [site('mitigateny_2025', 'shmp')]), qa: { datasets: refs('full'), intake: refs('stub') } };
    const found = await findCoveringSite({ installs: [inst], patternKeys: keys, slug: 'home', loadSites });
    expect(found?.refs.tickets.slug).toBe('full_tickets');
  });

  it("skips an install with no tickets dataset", async () => {
    const inst = install(1, [site('mitigateny_2025', 'shmp')], { patterns: refs('x').patterns });
    expect(await findCoveringSite({ installs: [inst], patternKeys: keys, slug: 'home', loadSites })).toBeNull();
  });
});

describe("intakeRefs", () => {
  it("is null without both refs", () => {
    expect(intakeRefs({ qa: { intake: { tickets: refs('a').tickets } } })).toBeNull();
    expect(intakeRefs({ id: 1, no_access: true })).toBeNull();
    expect(intakeRefs(undefined)).toBeNull();
  });
});

describe("reportRow", () => {
  const s = site('mitigateny_2025', 'shmp');
  const page = { url_slug: 'explore/hazards', title: 'Hazards' };

  it("keys the ticket to the page as track-on-publish does", () => {
    const row = reportRow({ kind: 'problem', severity: 'Major', title: ' Chart is empty ', description: ' No bars. ', site: s, page });
    expect(row).toEqual({
      title: 'Chart is empty', description: 'No bars.', severity: 'Major',
      page_key: 'shmp:explore/hazards', surface: 'shmp', page_route: '/explore/hazards', page_name: 'Hazards',
    });
  });

  it("files an idea as severity Feature", () => {
    expect(reportRow({ kind: 'idea', severity: 'Blocker', title: 'a', description: 'b', site: s, page }).severity).toBe('Feature');
  });

  it("defaults a problem's severity", () => {
    expect(reportRow({ kind: 'problem', title: 'a', description: 'b', site: s, page }).severity).toBe(DEFAULT_REPORT_SEVERITY);
  });

  it("stores the browser details as JSON", () => {
    const env = { url: 'https://x/explore/hazards', browser: 'UA', window: '1440×900' };
    expect(JSON.parse(reportRow({ title: 'a', description: 'b', site: s, page, env }).env)).toEqual(env);
  });
});

describe("the tickets dataset refs", () => {
  const ref = { slug: 'qa_tickets', source_id: 2824063, view_id: 2824064 };

  it("writes to the split type, as track-on-publish writes the pages dataset", () => {
    expect(ticketsFormat('mitigat-ny-prod', ref)).toEqual({
      app: 'mitigat-ny-prod', type: 'qa_tickets|2824064:data', isDms: true,
      source_id: 2824063, view_id: 2824064, env: 'mitigat-ny-prod+qa_tickets',
    });
  });

  it("numbers tickets across the whole source, with the New ticket form's fills", async () => {
    const calls = [];
    const apiLoad = async (config) => {
      calls.push(config);
      const attr = config.children[0].filter.attributes[0];
      return [{ [attr]: 106 }];
    };
    const row = reportRow({ kind: 'problem', severity: 'Minor', title: 'a', description: 'b', site: site('admin', 'admin'), page: { url_slug: 'forms' } });
    const data = await applyCreateDefaults({
      columns: REPORT_DEFAULTS, newItem: row, apiLoad,
      externalSource: ticketsSource('mitigat-ny-prod', ref), user: { email: 'staff@example.com' },
    });
    expect(data.ticket_id).toBe('107');
    expect(data).toMatchObject({ status: 'Triage', source: 'client', reporter: 'staff@example.com', reporter_email: 'staff@example.com' });
    expect(data.opened).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
    expect(data.updated).toBe(data.opened);
    expect(calls).toHaveLength(1);
    expect(calls[0].format).toMatchObject({ app: 'mitigat-ny-prod', type: 'qa_tickets', env: 'mitigat-ny-prod+qa_tickets', view_id: 2824064 });
  });

  it("starts numbering at 101 on an empty source", async () => {
    const apiLoad = async (config) => [{ [config.children[0].filter.attributes[0]]: 0 }];
    const data = await applyCreateDefaults({
      columns: REPORT_DEFAULTS, newItem: {}, apiLoad, externalSource: ticketsSource('a', ref), user: { email: 'x' },
    });
    expect(data.ticket_id).toBe('101');
  });
});
