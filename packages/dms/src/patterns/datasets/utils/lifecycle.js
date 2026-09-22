/**
 * Lifecycle vocabulary — the closed set of category top-levels that mean
 * "how alive is this dataset", as opposed to "what is it about".
 *
 * Status is encoded by PLACEMENT: a source in none of these is production.
 * There is no `Active` tag to forget to apply.
 *
 * Hiding is per PATTERN, stored as a DELTA against these defaults rather than
 * an absolute list. That is deliberate: if a pattern stored the resolved list at
 * creation time, adding a name here later would reach no existing pattern, and
 * every catalog made before the change would silently start showing the new
 * bucket. A delta propagates new defaults everywhere and pins only the
 * departures someone actually chose.
 *
 * The server keeps its own copy of the default list (dms-server
 * `uda.controller.js` DEFAULT_HIDDEN_CATEGORIES) because the two packages don't
 * share code — keep them in sync.
 */

export const LIFECYCLE_DEFAULTS = ['Sandbox', 'Archive', 'Data Processing', 'Uploaded File'];

/**
 * Where a source with no categories of its own lands. Hidden by default (it is
 * in LIFECYCLE_DEFAULTS), so a fresh upload is findable under Sandbox instead of
 * appearing in the catalog unreviewed.
 */
export const SANDBOX_CATEGORY = 'Sandbox';

/**
 * `Sandbox` may be un-hidden by a pattern, but the UI warns: new sources default
 * into it, so showing it puts every upload in the catalog the moment it
 * finishes. Marked rather than forbidden — an env that opts out of the sandbox
 * default has a legitimate reason to show it.
 */
export const REQUIRED_HIDDEN = [SANDBOX_CATEGORY];

/**
 * Resolve the hidden set for one pattern from the env's settings blob.
 *
 * Two layers over the library defaults:
 *   settings.hidden_categories                   — env-wide delta (every catalog)
 *   settings.hidden_categories_by_pattern[id]    — this catalog's own delta
 *
 * Both live in the env settings rather than on the pattern row. The pattern row
 * would be the tidier home, but there is no safe write path to it from inside
 * the pattern's own pages — patterns carry routing, and a bad write breaks the
 * site. The env settings blob already has a working, tested read/write path
 * (`uda[env].settings`), so per-pattern state is keyed by pattern id inside it.
 *
 * The env layer is also what the SERVER can enforce: `uda.controller` reads
 * `settings.hidden_categories` to exclude rows from the enumeration. The
 * per-pattern layer is client-side only — the Falcor route is keyed by env, not
 * by pattern, and at a few hundred rows the difference is not measurable.
 */
export const resolveHiddenForPattern = (settings, patternId, defaults = LIFECYCLE_DEFAULTS) => {
    const envDelta = settings?.hidden_categories;
    const patDelta = patternId != null
        ? settings?.hidden_categories_by_pattern?.[String(patternId)]
        : null;
    const afterEnv = resolveHiddenCategories(envDelta, defaults);
    return resolveHiddenCategories(patDelta, [...afterEnv]);
};

/** The two-layer equivalent of `isOverridden` — did THIS pattern depart? */
export const isPatternOverride = (name, settings, patternId, defaults = LIFECYCLE_DEFAULTS) => {
    const envSet = resolveHiddenCategories(settings?.hidden_categories, defaults);
    const full = resolveHiddenForPattern(settings, patternId, defaults);
    return envSet.has(name) !== full.has(name);
};

/**
 * Resolve a pattern's hidden set: defaults ∪ delta.hide \ delta.show.
 *
 * @param {{hide?: string[], show?: string[]}|string[]|null} delta
 *   A `{hide, show}` delta. A bare array is accepted and treated as an absolute
 *   list — the shape a pattern authored before this existed might carry.
 * @param {string[]} [defaults]
 * @returns {Set<string>} top-level names to hide
 */
export const resolveHiddenCategories = (delta, defaults = LIFECYCLE_DEFAULTS) => {
    if (Array.isArray(delta)) return new Set(delta.filter(c => typeof c === 'string' && c));
    const hide = Array.isArray(delta?.hide) ? delta.hide : [];
    const show = new Set(Array.isArray(delta?.show) ? delta.show : []);
    return new Set([...defaults, ...hide].filter(c => typeof c === 'string' && c && !show.has(c)));
};

/** Is `name` hidden only because this pattern departed from the defaults? */
export const isOverridden = (name, delta, defaults = LIFECYCLE_DEFAULTS) => {
    if (Array.isArray(delta)) return false;
    const inDefaults = defaults.includes(name);
    const hidden = resolveHiddenCategories(delta, defaults).has(name);
    return inDefaults !== hidden;
};

/** Flip one name, returning the new delta. Keeps the delta minimal. */
export const toggleHidden = (name, delta, defaults = LIFECYCLE_DEFAULTS) => {
    const base = Array.isArray(delta) ? {} : { hide: [...(delta?.hide || [])], show: [...(delta?.show || [])] };
    const hidden = resolveHiddenCategories(delta, defaults).has(name);
    const want = !hidden;
    const isDefault = defaults.includes(name);
    base.hide = (base.hide || []).filter(c => c !== name);
    base.show = (base.show || []).filter(c => c !== name);
    if (want !== isDefault) (want ? base.hide : base.show).push(name);   // only pin a departure
    if (!base.hide.length) delete base.hide;
    if (!base.show.length) delete base.show;
    return base;
};

/** Reset one name to the library default. */
export const resetHidden = (name, delta) => {
    if (Array.isArray(delta)) return {};
    const out = { hide: (delta?.hide || []).filter(c => c !== name), show: (delta?.show || []).filter(c => c !== name) };
    if (!out.hide.length) delete out.hide;
    if (!out.show.length) delete out.show;
    return out;
};

/**
 * Is this source hidden from a catalog?
 *
 * The rule is ANY, not EVERY. The legacy `filtered_categories` list hid a source
 * only when every one of its top-levels was listed, which meant hiding anything
 * required listing its neighbours too — the ratchet that grew hazmit_dama's list
 * to 67 of 81 names. It also makes the two-facet vocabulary impossible: a source
 * carrying `Built Environment › BILD` AND `Data Processing › Buildings` could
 * never be hidden without also hiding the whole `Built Environment` area.
 *
 * `legacyFiltered` keeps the old list working, unchanged, for envs that have not
 * migrated.
 */
export const isSourceHidden = (source, hiddenSet, legacyFiltered = []) => {
    const cats = (Array.isArray(source?.categories) ? source.categories : [])
        .map(c => (Array.isArray(c) ? c[0] : c))
        .filter(Boolean);
    if (!cats.length) return null;                                  // uncategorized — caller decides
    if (cats.some(c => hiddenSet.has(c))) return true;              // new rule
    if (!legacyFiltered.length) return false;
    return cats.every(c => legacyFiltered.includes(c));             // legacy rule, untouched
};

/**
 * The promotion gate. Each entry is something a dataset must have before it can
 * leave a hidden lifecycle for the catalog.
 *
 * This is the leverage point for metadata quality. Retrofitting descriptions
 * onto datasets that are already public is a chore nobody does — 45% of
 * hazmit_dama's sources have none. Requiring one at the moment someone actually
 * wants their dataset found costs thirty seconds and is the only moment they
 * are motivated.
 */
export const PROMOTION_CHECKS = [
    { key: 'area',         label: 'Add a subject area (a category outside the hidden lifecycles)' },
    { key: 'description',  label: 'Write a description' },
    { key: 'display_name', label: 'Set a display name' },
    { key: 'view',         label: 'Publish at least one version' },
];
export const DEFAULT_PROMOTION_CHECKS = ['area', 'description', 'display_name'];

const hasText = (v) => {
    if (v == null) return false;
    if (typeof v === 'string') {
        const t = v.trim();
        if (!t) return false;
        // Lexical stores rich text as a JSON doc — an "empty" description is a
        // valid document with no text in it, which a length check would pass.
        if (t.startsWith('{')) {
            try { return /"text"\s*:\s*"[^"]+"/.test(t); } catch { return false; }
        }
        return true;
    }
    if (typeof v === 'object') { try { return /"text"\s*:\s*"[^"]+"/.test(JSON.stringify(v)); } catch { return false; } }
    return false;
};

/**
 * What still stands between this source and the catalog. Empty array = ready.
 * @returns {{key: string, label: string}[]}
 */
export const promotionBlockers = (source, categories, hiddenSet, enabled = DEFAULT_PROMOTION_CHECKS) => {
    const on = Array.isArray(enabled) ? enabled : DEFAULT_PROMOTION_CHECKS;
    const cats = (Array.isArray(categories) ? categories : []).map(c => (Array.isArray(c) ? c[0] : c)).filter(Boolean);
    const out = [];
    for (const check of PROMOTION_CHECKS) {
        if (!on.includes(check.key)) continue;
        const ok =
            check.key === 'area'         ? cats.some(c => !hiddenSet.has(c)) :
            check.key === 'description'  ? hasText(source?.description) :
            check.key === 'display_name' ? hasText(source?.display_name) :
            check.key === 'view'         ? Number(source?.view_count ?? source?.views?.length ?? 0) > 0 :
            true;
        if (!ok) out.push(check);
    }
    return out;
};
