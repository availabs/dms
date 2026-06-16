/**
 * Pattern duplicate handler (new type model).
 *
 * Deep-clones a page pattern's CONTENT: every `<oldInstance>|page` row + every
 * `<oldInstance>|component` row, re-created under `<newInstance>`, remapping the
 * page↔section cross-references. The pattern ROW itself is created by the client
 * (`patternList.jsx` calls `addNewValue` after this), so we don't touch it here.
 *
 * Replaces the legacy avail-falcor `cloneType`, which was written for the old
 * doc_type/ref-array model and was never ported — so the Duplicate button
 * (POST /dama-admin/dms/:appType/duplicate) used to 404 silently and the copy
 * landed with no pages.
 *
 *   POST /dama-admin/dms/:appType/duplicate     (:appType = "<app>+<oldInstance>")
 *   body: { newApp?, newType (= new instance slug) }
 *   → { data:'success', newInstance, pages, components }
 *
 * Notes:
 * - Pages/components are located by type (`<instance>|page` / `<instance>|component`),
 *   not via an embedded array on the pattern.
 * - `history` is not cloned (its refs would dangle); the copy starts with fresh history.
 */
const { buildType } = require('../../db/type-utils');

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
  return async function duplicate(req, res) {
    // Duplicating large patterns can take well over 30 s (many sequential DB
    // transactions — one per page, two per section). Override the global 30s
    // request timeout so the operation isn't killed mid-flight.
    req.setTimeout(300_000); // 5 minutes
    const [app, oldInstance] = (req.params.appType || '').split('+');
    const { newApp = app, newType: newInstance } = req.body || {};
    const user = { id: req.user?.id ?? null };
    if (!app || !oldInstance || !newInstance) {
      return res.status(400).json({ err: 'appType ("app+oldInstance") and newType are required' });
    }
    console.log('entering try')
    try {
      // 1) clone pages (defer section-ref remap until the sections exist)
      const pages = await controller.getRowsByTypes(app, [buildType({ parent: oldInstance, kind: 'page' })]);
      const newPageType = buildType({ parent: newInstance, kind: 'page' });
      const pageIdMap = {};
      let pageI = 0;
      for (const p of pages) {
        console.log(`page ${++pageI} of ${pages.length}`)
        const data = asObj(p.data);
        delete data.history;
        const [np] = await controller.createData([newApp, newPageType, data], user);
        pageIdMap[String(p.id)] = np.id;
      }

      // 2) clone components in parallel batches — each component is independent
      //    (pageIdMap is fully built above; secIdMap keys are disjoint per component)
      const comps = await controller.getRowsByTypes(app, [buildType({ parent: oldInstance, kind: 'component' })]);
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
          console.log(`[dms-duplicate] component ${++compDone}/${comps.length}`);
        }));
      }

      // 3) fix up cloned pages: section lists → new section ids/refs, page-tree parent, id mirror
      //    All page updates are independent once secIdMap is complete, so run in parallel.
      await Promise.all(pages.map(async (p) => {
        const newPageId = pageIdMap[String(p.id)];
        const d = asObj(p.data);
        const patch = {
          id: newPageId,
          sections: remapSectionRefs(d.sections, secIdMap, newApp, newInstance),
          draft_sections: remapSectionRefs(d.draft_sections, secIdMap, newApp, newInstance),
        };
        // section_groups / draft_section_groups are band UUIDs already on the cloned page — left as-is.
        if (d.parent && pageIdMap[String(d.parent)]) patch.parent = pageIdMap[String(d.parent)];
        await controller.setDataById(newPageId, patch, user, newApp);
      }));

      return res.json({ data: 'success', newInstance, pages: pages.length, components: comps.length });
    } catch (err) {
      console.error('[dms-duplicate] error:', err.message);
      if (!res.headersSent) {
        return res.status(500).json({ err: err.message });
      }
    }
  };
}

module.exports = { createDuplicateHandler };
