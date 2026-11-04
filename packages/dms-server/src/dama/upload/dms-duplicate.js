/**
 * Pattern duplicate handler (new type model).
 *
 * Deep-clones a page pattern's CONTENT: every `<oldInstance>|page` row + every
 * `<oldInstance>|component` row, re-created under `<newInstance>`, remapping the
 * page↔section cross-references. The pattern ROW itself is created by the client
 * (`patternList.jsx` calls `addNewValue` after this), so we don't touch it here.
 *
 * The operation is handed off to the DMS task queue so the HTTP request returns
 * immediately with `{ task_id }`. The client polls
 * `GET /dama-admin/dms/tasks/:taskId` until status is `done` or `error`, then
 * calls `addNewValue` to create the pattern row.
 *
 *   POST /dama-admin/dms/:appType/duplicate     (:appType = "<app>+<oldInstance>")
 *   body: { newApp?, newType (= new instance slug) }
 *   → { task_id }
 *
 * Notes:
 * - Pages/components are located by type (`<instance>|page` / `<instance>|component`),
 *   not via an embedded array on the pattern.
 * - `history` is not cloned (its refs would dangle); the copy starts with fresh history.
 */
const { buildType } = require('../../db/type-utils');
const { registerHandler, queueTask } = require('../../dms/tasks');
const { requestUserId } = require('../../routes/auth/requestUser');

const asObj = (d) => (typeof d === 'string'
  ? (() => { try { return JSON.parse(d); } catch { return {}; } })()
  : (d ? { ...d } : {}));

// Remap a page's section list (`{id, ref}[]`) to the cloned section ids + new ref string.
//
// The ref moves ONLY when the id did. An entry pointing at a row outside this pattern is not ours
// to re-home: its id correctly stays put, so rewriting its ref would leave it claiming a type it
// does not point at. Measured: duplicating `mitigat-ny-prod`'s `admin` pattern with the old
// unconditional rewrite corrupted 1,081 of 2,248 cloned entries, and the originals were fine — so
// every earlier use of Duplicate did the same.
function remapSectionRefs(arr, secIdMap, newApp, newInstance) {
  if (!Array.isArray(arr)) return arr;
  const ref = `${newApp}+${newInstance}|component`;
  return arr.map((e) => {
    if (!e || typeof e !== 'object') return e;
    const newId = secIdMap[String(e.id)];
    return newId != null ? { ...e, id: newId, ref } : e;
  });
}

/**
 * The duplicate itself, independent of the task queue.
 *
 * Exported so it can be driven directly — by a test, a migration script, or a one-off repair —
 * without an HTTP request, a signed-in user and a DAMA task row. The queue handler below is a thin
 * wrapper over it.
 *
 * `report` receives progress in [0,1]; `log` receives human-readable lines.
 */
async function duplicatePatternContent(controller, descriptor, { report = async () => {}, log = console.log, tag = '[dms-duplicate]' } = {}) {
  {
    const { app, oldInstance, newInstance, newApp, userId } = descriptor;
    const user = { id: userId ?? null };
    const ctx = { updateProgress: report };
    const console = { log };

    // 1) clone pages (defer section-ref remap until the sections exist)
    const allPages = await controller.getRowsByTypes(app, [buildType({ parent: oldInstance, kind: 'page' })]);
    // Skip ghost/empty rows: a page whose data has no usable fields (e.g. a blank row left
    // behind by an earlier duplicate) would otherwise be cloned as yet another empty row.
    // Empty rows surface in the editor as { id: undefined, parent: undefined }, which makes
    // the page-tree nav's getChildNav match `undefined === undefined`, treat them as their
    // own children, and recurse until the stack overflows. Dropping them here stops the
    // corruption from propagating into every copy.
    const pages = allPages.filter(p => Object.keys(asObj(p.data)).length > 0);
    const skippedPages = allPages.length - pages.length;
    if (skippedPages) console.log(`${tag} skipped ${skippedPages} empty/ghost page row(s)`);
    const newPageType = buildType({ parent: newInstance, kind: 'page' });
    const pageIdMap = {};
    let pageI = 0;
    for (const p of pages) {
      const data = asObj(p.data);
      delete data.history;
      const [np] = await controller.createData([newApp, newPageType, data], user);
      pageIdMap[String(p.id)] = np.id;
      console.log(`${tag} page ${++pageI}/${pages.length}`);
      await ctx.updateProgress(pageI / pages.length * 0.3);
    }

    // 2) clone components in parallel batches — each component is independent.
    //
    // Only LIVE components are copied. A component is live iff a page OF THIS PATTERN lists its id
    // in `sections` / `draft_sections` — there is no cross-pattern rendering relationship in DMS
    // (owner, 2026-10-28), so a component no page of its own pattern lists renders nowhere.
    //
    // Measured on `mitigat-ny-prod`'s `admin` pattern: of 2,252 components, 1,048 were listed by no
    // page anywhere in the app and another 34 only by a page of ANOTHER pattern through a ref that
    // does not resolve. Copying them forward is what made duplicates grow without bound — the
    // `undefined_copy` → `undefined_copy_copy` chain dragged ~3,700 components (~177 MB) per
    // generation until a Falcor response passed V8's string limit (see nameToSlug's docstring and
    // planning/tasks/current/falcor-response-string-limit-crash.md).
    const liveCompIds = new Set();
    for (const p of pages) {
      const d = asObj(p.data);
      for (const key of ['sections', 'draft_sections']) {
        for (const e of (Array.isArray(d[key]) ? d[key] : [])) {
          if (e && e.id != null) liveCompIds.add(String(e.id));
        }
      }
    }
    const allComps = await controller.getRowsByTypes(app, [buildType({ parent: oldInstance, kind: 'component' })]);
    const nonEmpty = allComps.filter(c => Object.keys(asObj(c.data)).length > 0);
    const comps = nonEmpty.filter(c => liveCompIds.has(String(c.id)));
    const skippedComps = allComps.length - nonEmpty.length;
    const skippedDead = nonEmpty.length - comps.length;
    if (skippedComps) console.log(`${tag} skipped ${skippedComps} empty/ghost component row(s)`);
    if (skippedDead) console.log(`${tag} skipped ${skippedDead} component(s) no page of this pattern lists`);
    const newCompType = buildType({ parent: newInstance, kind: 'component' });
    const secIdMap = {};
    const COMP_BATCH = 50;
    let compDone = 0;
    for (let i = 0; i < comps.length; i += COMP_BATCH) {
      await Promise.all(comps.slice(i, i + COMP_BATCH).map(async (c) => {
        const data = asObj(c.data);
        delete data.history;
        // No `parent` to carry or rebuild: a component's containment is `parent_id`, and step 3
        // below sets it for free — patching each cloned page's section list through `setDataById`
        // makes `stampChildren` stamp every component that list names. Until 2026-10-29 this
        // rebuilt `data.parent` from the page that actually listed the component, because copying
        // the stored pointer corrupted 1,081 of 2,248 cloned components the one time it was tried.
        delete data.parent;
        const [nc] = await controller.createData([newApp, newCompType, data], user);
        secIdMap[String(c.id)] = nc.id;
        await controller.setDataById(nc.id, { id: nc.id }, user, newApp);
        const done = ++compDone;
        console.log(`${tag} component ${done}/${comps.length}`);
      }));
      await ctx.updateProgress(0.3 + compDone / comps.length * 0.6);
    }

    // 3) fix up cloned pages: section lists → new section ids/refs, page-tree parent, id mirror
    await Promise.all(pages.map(async (p) => {
      const newPageId = pageIdMap[String(p.id)];
      const d = asObj(p.data);
      const patch = {
        id: newPageId,
        sections: remapSectionRefs(d.sections, secIdMap, newApp, newInstance),
        draft_sections: remapSectionRefs(d.draft_sections, secIdMap, newApp, newInstance),
      };
      if (d.parent && pageIdMap[String(d.parent)]) patch.parent = pageIdMap[String(d.parent)];
      await controller.setDataById(newPageId, patch, user, newApp);
    }));

    console.log(`${tag} done — ${pages.length} pages, ${comps.length} components`);
    return { newInstance, pages: pages.length, components: comps.length,
             skippedEmpty: skippedComps, skippedUnreferenced: skippedDead };
  }
}

function createDuplicateHandler(controller) {
  // Register the worker once — controller is captured in closure.
  // The polling loop picks this up and runs it in-process.
  registerHandler('dms/pattern_duplicate', (ctx) =>
    duplicatePatternContent(controller, ctx.task.descriptor, {
      report: (p) => ctx.updateProgress(p),
      tag: `[dms-duplicate task=${ctx.task.task_id}]`,
    }));

  return async function duplicate(req, res) {
    const [app, oldInstance] = (req.params.appType || '').split('+');
    const { newApp = app, newType: newInstance } = req.body || {};
    const userId = requestUserId(req);

    if (!app || !oldInstance || !newInstance) {
      return res.status(400).json({ err: 'appType ("app+oldInstance") and newType are required' });
    }

    try {
      const taskId = await queueTask({
        workerPath: 'dms/pattern_duplicate',
        app,
        oldInstance,
        newInstance,
        newApp,
        userId,
      });
      return res.json({ task_id: taskId });
    } catch (err) {
      console.error('[dms-duplicate] failed to queue task:', err.message);
      return res.status(500).json({ err: err.message });
    }
  };
}

module.exports = { createDuplicateHandler, duplicatePatternContent, remapSectionRefs };
