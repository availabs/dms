// Adding a QA install: the checks before its pattern row is created, and the datasets
// created after. The writes are plain `dms.data` creates/edits, in the same order the
// site templates use (utils/tenantProvisioning.js) and in the Datasets admin's shapes
// (patterns/datasets/pages/dataTypes/internal_table/pages/sourceCreate.jsx).
import { getInstance } from '../../utils/type-utils'
import { loadItemFresh } from '../../api'
import { getSourceIdsBySlug } from '../../api/sourceIdBySlug'
import { QA_DATASETS, qaDatasetSlug } from './datasets'

const newId = res => Object.keys(res?.json?.dms?.data?.byId || {}).find(k => k !== '$__path')
const trimSlashes = url => `${url || ''}`.replace(/^\/+|\/+$/g, '')
const sameMount = (a, b) =>
  trimSlashes(a.base_url) === trimSlashes(b.base_url) &&
  ((a.subdomain || '') === (b.subdomain || '') || a.subdomain === '*' || b.subdomain === '*')

// Why this install can't be added, or null. Runs before its pattern row exists.
// - Its URL mustn't already serve another pattern on the site.
// - None of its dataset names may exist anywhere in the app: rows find their source by
//   name, so a second same-named source would take the first one's rows.
export async function qaPreflight({ falcor, app, instance, pattern, siblings = [] }) {
  const clash = siblings.find(p => sameMount(p, pattern))
  if (clash) return `The URL "/${trimSlashes(pattern.base_url)}" is already used by the "${clash.name}" pattern.`

  const slugs = QA_DATASETS.map(d => qaDatasetSlug(instance, d.key))
  const found = await getSourceIdsBySlug(falcor, app, slugs)
  const taken = slugs.filter(slug => found[slug])
  if (taken.length) return `A dataset named ${taken.join(', ')} already exists in this app.`
  return null
}

// The environment an install's datasets go in: the site's Datasets pattern's (the same
// default page patterns read datasets through), else the site's first one, else none.
export function pickQaEnvironment({ patterns = [], dmsEnvs = [] }) {
  const envs = dmsEnvs.filter(env => env?.id)
  const datasetsEnvId = patterns.find(p => p?.pattern_type === 'datasets' && p.dmsEnvId)?.dmsEnvId
  return envs.find(env => +env.id === +datasetsEnvId) || envs[0] || null
}

// What to do for each dataset the install hasn't recorded. `have` is its recorded
// `qa.datasets`; `existing` maps a dataset name to the source it already resolves to. An
// existing one is adopted, not refused: the pre-check refused every taken name before the
// install's pattern row existed, so only an interrupted run of this install can have made it.
export function planQaDatasets({ app, envInstance, instance, installName, have = {}, existing = {} }) {
  return QA_DATASETS
    .filter(d => !have[d.key])
    .map(d => {
      const slug = qaDatasetSlug(instance, d.key)
      return {
        key: d.key,
        slug,
        adoptSourceId: existing[slug] || null,
        sourceType: `${envInstance}|${slug}:source`,
        source: {
          name: `${installName} — ${d.name}`,
          type: 'internal_table',
          config: JSON.stringify({ attributes: d.attributes }),
        },
        viewType: `${slug}|v1:view`,
        view: { name: 'version 1' },
        viewRef: `${app}+${slug}|view`,
        envSourceRef: `${app}+${envInstance}|source`,
      }
    })
}

// The site's environments, read fresh by id. Not from the admin's context (loaded once per
// page, so a second install in the same session wouldn't see the first one's environment),
// and not from the refs' type strings (a Sites-page save rewrites refs to the format's type).
async function loadSiteEnvironments(falcor, app, site) {
  const refs = (site?.data?.dms_envs || []).filter(r => r?.id)
  const rows = await Promise.all(refs.map(r => loadItemFresh(falcor, app, r.id)))
  return rows.filter(Boolean).map(row => ({ id: +row.id, type: row.type, name: row.data?.name }))
}

// A `default` environment linked from the site's `dms_envs`, for a site that has none.
// Same rows as the pattern editor's "create new environment" and the Dashboard template.
async function createDefaultEnvironment({ falcor, app, siteInstance, site }) {
  const envType = `${siteInstance}|default:dmsenv`
  const envId = newId(await falcor.call(['dms', 'data', 'create'], [app, envType, { name: 'default', sources: [] }]))
  if (!envId) throw new Error('Could not create a data environment.')
  await falcor.call(['dms', 'data', 'edit'], [app, +site.id, {
    dms_envs: [...(site.data?.dms_envs || []), { ref: `${app}+${envType}`, id: +envId }],
  }])
  return { id: +envId, type: envType, name: 'default' }
}

// Adds a source to the environment's list, read fresh, unless it's already there.
async function addToEnvironment(falcor, app, env, envInstance, sourceId) {
  const fresh = await loadItemFresh(falcor, app, env.id)
  const sources = (fresh?.data?.sources || []).filter(s => s?.id)
  if (sources.some(s => +s.id === +sourceId)) return
  const ref = `${app}+${envInstance}|source`
  await falcor.call(['dms', 'data', 'edit'], [app, +env.id, {
    sources: [...sources.map(s => ({ ref: s.ref || ref, id: +s.id })), { ref, id: +sourceId }],
  }])
}

// Creates (or adopts) the datasets the install hasn't recorded, in `env`, and returns every
// dataset's reference: { [key]: { slug, source_id, view_id } }. After each one it's listed in
// the environment and `onRecorded(datasets)` is called, so an interrupted run leaves an
// accurate record and a re-run carries on from it.
export async function ensureQaDatasets({ falcor, app, env, instance, installName, have = {}, onRecorded = async () => {} }) {
  const envInstance = getInstance(env.type)
  const datasets = { ...have }
  const missing = QA_DATASETS.filter(d => !have[d.key]).map(d => qaDatasetSlug(instance, d.key))
  const existing = await getSourceIdsBySlug(falcor, app, missing)
  for (const step of planQaDatasets({ app, envInstance, instance, installName, have, existing })) {
    let sourceId = step.adoptSourceId
    let viewId = null
    if (sourceId) {
      viewId = (await loadItemFresh(falcor, app, sourceId))?.data?.views?.find(v => v?.id)?.id || null
    } else {
      sourceId = newId(await falcor.call(['dms', 'data', 'create'], [app, step.sourceType, step.source]))
      if (!sourceId) throw new Error(`Could not create the ${step.slug} dataset.`)
    }
    if (!viewId) {
      viewId = newId(await falcor.call(['dms', 'data', 'create'], [app, step.viewType, step.view]))
      if (!viewId) throw new Error(`Could not create a version of the ${step.slug} dataset.`)
      await falcor.call(['dms', 'data', 'edit'], [app, +sourceId, { views: [{ ref: step.viewRef, id: +viewId }] }])
    }
    await addToEnvironment(falcor, app, env, envInstance, sourceId)
    datasets[step.key] = { slug: step.slug, source_id: +sourceId, view_id: +viewId }
    await onRecorded(datasets)
  }
  return datasets
}

// The install's environment: the one its row records, if it still exists; else the site's
// Datasets pattern's, else the site's first, else a new `default` one.
async function resolveEnvironment({ falcor, app, siteId, siteInstance, recordedEnvId, patterns }) {
  if (recordedEnvId) {
    const row = await loadItemFresh(falcor, app, recordedEnvId)
    if (row) return { id: +row.id, type: row.type, name: row.data?.name }
  }
  const site = await loadItemFresh(falcor, app, siteId)
  if (!site) throw new Error('Could not read the site.')
  return pickQaEnvironment({ patterns, dmsEnvs: await loadSiteEnvironments(falcor, app, site) })
    || await createDefaultEnvironment({ falcor, app, siteInstance, site })
}

// Sets up a QA install's datasets, right after its pattern row is created and again from its
// Overview to finish an interrupted run. The row is written first (its environment, an empty
// record, and permissions private to the site's admins as new sites' patterns are,
// createSite.jsx), then updated after each dataset. Permissions are only set when the row has
// none, so a re-run never overrides ones an admin chose.
// Returns { env, datasets, authPermissions } (the permissions it wrote, or undefined).
export async function installQa({ falcor, app, siteId, siteInstance, patternId, instance, installName, patterns }) {
  const pattern = await loadItemFresh(falcor, app, patternId)
  if (!pattern) throw new Error('Could not read the pattern.')
  const have = pattern.data?.qa?.datasets || {}
  const env = await resolveEnvironment({ falcor, app, siteId, siteInstance, recordedEnvId: pattern.data?.dmsEnvId, patterns })
  const authPermissions = pattern.data?.authPermissions
    ? undefined
    : JSON.stringify({ groups: { [`${app} Admin`]: ['*'], public: [] }, users: {} })
  await falcor.call(['dms', 'data', 'edit'], [app, +patternId, {
    dmsEnvId: +env.id,
    qa: { version: 1, datasets: have },
    ...(authPermissions ? { authPermissions } : {}),
  }])
  const datasets = await ensureQaDatasets({
    falcor, app, env, instance, installName, have,
    onRecorded: recorded => falcor.call(['dms', 'data', 'edit'], [app, +patternId, { qa: { version: 1, datasets: recorded } }]),
  })
  return { env, datasets, authPermissions }
}
