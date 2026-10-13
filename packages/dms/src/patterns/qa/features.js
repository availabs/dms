// An install's switchable features, in two groups over the shared tickets core (the Tickets and
// Ticket pages, statuses, the change history, Recent activity, Report an issue and covered sites,
// which have no switch). Switched on the install's Configure tab; QA pages, track-on-publish and
// Configure's own backfill read them. No browser imports, so the CLI's publish path uses this too.
//
// Stored as an allow-list on the install row, `qa.features`: the keys of the features that are on.
// A feature added later is off on every existing install until someone switches it on. Off hides,
// never deletes: the feature's rows stay in its dataset.

// Each group's features, in display order. `needs`: a feature that has to be on for this one to be.
export const FEATURE_GROUPS = [
  {
    key: 'delivery_qa',
    label: 'Delivery QA',
    description: 'Pages moving through stages to client acceptance.',
    features: [
      { key: 'page_inventory', label: 'Page inventory', description: "Each covered site's pages, added as they're published, and a QA page for each." },
      { key: 'page_stages', label: 'Page stages', needs: 'page_inventory', description: 'A stage per page, Proposed to Client Acceptance, and "How delivery works".' },
      { key: 'stories', label: 'Stories', needs: 'page_inventory', description: 'Acceptance criteria on each page.' },
    ],
  },
  {
    key: 'help_desk',
    label: 'Help desk',
    description: "Requests from a live site's users, answered on time.",
    // filled in as its features are built; Configure shows a group once it has one
    features: [],
  },
]

const FEATURES = FEATURE_GROUPS.flatMap((g) => g.features)
const featureByKey = new Map(FEATURES.map((f) => [f.key, f]))

// What an install made before switches has: everything it showed then, the Delivery QA group.
export const LEGACY_FEATURES = FEATURE_GROUPS.find((g) => g.key === 'delivery_qa').features.map((f) => f.key)

// The stored list: the install's own, else the legacy set when it has none (not even an empty one).
export const storedFeatures = (pattern) => (Array.isArray(pattern?.qa?.features) ? pattern.qa.features : LEGACY_FEATURES)

// The features that are on, as a Set: the stored list, less unknown keys and any feature whose
// `needs` is off (so a hand-edited row can't show stages without the pages they belong to).
export function installFeatures(pattern) {
  const stored = new Set(storedFeatures(pattern))
  const on = (key) => stored.has(key) && featureByKey.has(key) && (!featureByKey.get(key).needs || on(featureByKey.get(key).needs))
  return new Set([...stored].filter(on))
}

export const hasFeature = (pattern, key) => installFeatures(pattern).has(key)

// ── Configure's switches: each returns the new stored list (a fresh array, in display order) ──

const ordered = (keys) => FEATURES.map((f) => f.key).filter((k) => keys.has(k))

// One feature on or off. Switching one off also switches off the features that need it, so the
// list is always exactly what's on; switching one on needs its prerequisite on already (the
// switch is disabled until then), and does nothing otherwise.
export function setFeature(list = [], key, enabled) {
  const keys = new Set(list)
  const feature = featureByKey.get(key)
  if (!feature) return ordered(keys)
  if (enabled) {
    if (feature.needs && !keys.has(feature.needs)) return ordered(keys)
    keys.add(key)
  } else {
    const drop = (k) => {
      keys.delete(k)
      FEATURES.filter((f) => f.needs === k).forEach((f) => drop(f.key))
    }
    drop(key)
  }
  return ordered(keys)
}

// A whole group on (every one of its features) or off (none of them).
export function setGroup(list = [], groupKey, enabled) {
  const group = FEATURE_GROUPS.find((g) => g.key === groupKey)
  const keys = new Set(list)
  for (const f of group?.features || []) {
    if (enabled) keys.add(f.key)
    else keys.delete(f.key)
  }
  return ordered(keys)
}

// A group's switch: on when any of its features is; `count` of `total` for the "2 of 3 on" note.
export function groupState(list = [], groupKey) {
  const group = FEATURE_GROUPS.find((g) => g.key === groupKey)
  const keys = new Set(list)
  const total = group?.features.length || 0
  const count = (group?.features || []).filter((f) => keys.has(f.key)).length
  return { on: count > 0, count, total }
}

// Why a feature's switch is disabled (its prerequisite is off), or ''.
export function featureBlocked(list = [], key) {
  const needs = featureByKey.get(key)?.needs
  return needs && !list.includes(needs) ? `needs ${featureByKey.get(needs).label}` : ''
}

// The save bar's words for a change of switches: "Page stages switched off", "Delivery QA switched
// on" when a whole group changed. Compares the stored lists (`before`: the row's, legacy included).
export function describeFeatureEdits(after = [], before = []) {
  const a = new Set(after)
  const b = new Set(before)
  const edits = []
  for (const group of FEATURE_GROUPS) {
    const changed = group.features.filter((f) => a.has(f.key) !== b.has(f.key))
    if (!changed.length) continue
    if (changed.length === group.features.length && changed.every((f) => a.has(f.key) === a.has(changed[0].key))) {
      edits.push(`${group.label} switched ${a.has(changed[0].key) ? 'on' : 'off'}`)
    } else {
      changed.forEach((f) => edits.push(`${f.label} switched ${a.has(f.key) ? 'on' : 'off'}`))
    }
  }
  return edits
}
