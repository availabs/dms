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

const asObj = (d) => (typeof d === 'string'
  ? (() => { try { return JSON.parse(d); } catch { return {}; } })()
  : (d ? { ...d } : {}));

// Remap a page's section list (`{id, ref}[]`) to the cloned section ids + new ref string.
function remapSectionRefs(arr, secIdMap, newApp, newInstance) {
  if (!Array.isArray(arr)) return arr;
  const ref = `${newApp}+${newInstance}|component`;
  return arr.map((e) => {
    if (!e || typeof e !== 'object') return e;
    const newId = secIdMap[String(e.id)];
    return { ...e, id: newId != null ? newId : e.id, ref };
  });
}

// Remap a section's `parent` (a stringified `{id, ref}` pointing at its page).
function remapParentRef(parent, pageIdMap, newApp, newInstance) {
  if (parent == null || parent === '') return parent;
  const isString = typeof parent === 'string';
  let obj;
  try { obj = isString ? JSON.parse(parent) : { ...parent }; } catch { return parent; }
  if (obj && obj.id != null) {
    const newId = pageIdMap[String(obj.id)];
    if (newId != null) obj.id = newId;
    obj.ref = `${newApp}+${newInstance}|page`;
  }
  return isString ? JSON.stringify(obj) : obj;
}

function createDuplicateHandler(controller) {
  // Register the worker once — controller is captured in closure.
  // The polling loop picks this up and runs it in-process.
  registerHandler('dms/pattern_duplicate', async (ctx) => {
    const { app, oldInstance, newInstance, newApp, userId } = ctx.task.descriptor;
    const user = { id: userId ?? null };
    const tag = `[dms-duplicate task=${ctx.task.task_id}]`;

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

    // 2) clone components in parallel batches — each component is independent
    const allComps = await controller.getRowsByTypes(app, [buildType({ parent: oldInstance, kind: 'component' })]);
    const comps = allComps.filter(c => Object.keys(asObj(c.data)).length > 0);
    const skippedComps = allComps.length - comps.length;
    if (skippedComps) console.log(`${tag} skipped ${skippedComps} empty/ghost component row(s)`);
    const newCompType = buildType({ parent: newInstance, kind: 'component' });
    const secIdMap = {};
    const COMP_BATCH = 50;
    let compDone = 0;
    for (let i = 0; i < comps.length; i += COMP_BATCH) {
      await Promise.all(comps.slice(i, i + COMP_BATCH).map(async (c) => {
        const data = asObj(c.data);
        delete data.history;
        data.parent = remapParentRef(data.parent, pageIdMap, newApp, newInstance);
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
    return { newInstance, pages: pages.length, components: comps.length };
  });

  return async function duplicate(req, res) {
    const [app, oldInstance] = (req.params.appType || '').split('+');
    const { newApp = app, newType: newInstance } = req.body || {};
    const userId = req.user?.id ?? null;

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

module.exports = { createDuplicateHandler };
