// import { falcor } from '~/index'
//import getActiveConfig  from '../dms-manager/getActiveConfig.js'
import { get } from "lodash-es"
import {createRequest, getIdPath} from './createRequest.js'
import processNewData from "./proecessNewData.js";
import updateDMSAttrs from "./updateDMSAttrs.js";
// import * as DmsManagerUtils from '../dms-manager/_utils.js'
// const { getActiveConfig } = DmsManagerUtils
//console.log('hola')

// const {createRequest, getIdPath} = cr

// --- Sync API (lazy reference, set by dmsSiteFactory after initSync) ---
// Use globalThis to avoid Vite module instance duplication issues —
// dynamic imports and barrel re-exports can resolve to separate module
// instances in dev mode, each with their own module-level `let` variables.
const _DEV = typeof import.meta !== 'undefined' && import.meta.env?.DEV;
export function _setSyncAPI(api) {
  if (!api) return; // Guard: React Strict Mode double-invokes effects
  globalThis.__dmsSyncAPI = api;
  if (_DEV) console.log('[dms:api] sync API wired in');
}
function _getSyncAPI() { return globalThis.__dmsSyncAPI || null; }

/**
 * Load items from local SQLite for synced types.
 * Mirrors the output shape of processNewData: flattened data + metadata fields.
 * Also resolves dms-format child items from local SQLite.
 */
async function loadFromLocalDB(sync, app, type, format, dmsAttrsConfigs, activeConfigs, path) {
  const t0 = _DEV ? performance.now() : 0;
  const result = await sync.exec(
    'SELECT * FROM data_items WHERE app = ? AND type = ? ORDER BY id',
    [app, type]
  );

  if (result.rows.length === 0) {
    if (_DEV) console.log(`[sync:load] ${app}+${type} — no local data, falling through to Falcor`);
    return null;
  }

  const items = result.rows.map(row => {
    const parsed = typeof row.data === 'string' ? JSON.parse(row.data) : (row.data || {});
    return {
      ...parsed,
      id: String(row.id),
      app: row.app,
      type: row.type,
      created_at: row.created_at,
      created_by: row.created_by,
      updated_at: row.updated_at,
      updated_by: row.updated_by,
    };
  });

  // Determine which items need ref resolution (match Falcor behavior:
  // only resolve for active/viewed items, not every item in a list)
  const activeViewEdit = activeConfigs?.find(c => ['view', 'edit'].includes(c.action));
  const activeId = activeViewEdit?.params?.id;
  // Page pattern uses wildcard matching: path "/*" captures url_slug in params['*']
  // Prefer the edit/view child config's params (has the clean slug) over the parent's
  // (which includes the edit/view prefix, e.g., "edit/know_the_environment")
  const wildcardParam = activeViewEdit?.params?.['*']
    || activeConfigs?.reduce((slug, c) => slug || c.params?.['*'], null) || '';
  const strippedWildcard = wildcardParam
    .replace(/^(edit|view)(\/|$)/, '')  // strip leading edit/ or view/ prefix (or bare "edit"/"view")
    .replace(/\/(edit|view)(\/.*)?$/, '') // strip trailing /edit or /view suffix
  const strippedPath = (path || '').replace(/^\//, '')
    .replace(/^(edit|view)(\/|$)/, '')
    .replace(/\/(edit|view)(\/.*)?$/, '')
  const activeSlug = strippedWildcard || strippedPath || '';
  const needsRefResolution = (item, idx) => {
    if (!Object.keys(dmsAttrsConfigs).length) return false;
    if (activeId && String(item.id) === String(activeId)) return true;
    if (activeSlug && item.url_slug === activeSlug) return true;
    // Home page: no slug/id specified, resolve for the default page (!parent && index==0)
    if (!activeSlug && !activeId && !item.parent && (item.index == 0 || item.index === '0')) return true;
    if (idx === 0) return true; // match processNewData behavior: first item
    return false;
  };

  // Resolve dms-format children from local SQLite (only for active items)
  for (let idx = 0; idx < items.length; idx++) {
    const item = items[idx];
    if (!needsRefResolution(item, idx)) continue;
    for (const [key, attrConfig] of Object.entries(dmsAttrsConfigs)) {
      // Parse JSON string refs if needed
      if (typeof item[key] === 'string') {
        try { item[key] = JSON.parse(item[key]); } catch { /* leave as-is */ }
      }

      if (item[key] && typeof item[key]?.[Symbol.iterator] === 'function') {
        // Array of refs
        const childIds = Array.from(item[key]).map(ref => ref.id || ref).filter(Boolean);
        if (childIds.length > 0) {
          const placeholders = childIds.map(() => '?').join(',');
          const children = await sync.exec(
            `SELECT * FROM data_items WHERE id IN (${placeholders})`,
            childIds
          );
          const childMap = new Map(children.rows.map(r => [String(r.id), r]));
          if (_DEV) {
            const missing = childIds.filter(id => !childMap.has(String(id)));
            if (missing.length > 0) {
              console.warn(`[sync:ref] item ${item.id} attr=${key}: ${missing.length}/${childIds.length} children NOT found in local SQLite:`, missing);
            }
          }
          item[key] = Array.from(item[key]).map(ref => {
            const refId = String(ref.id || ref);
            const child = childMap.get(refId);
            if (!child) return ref;
            const parsed = typeof child.data === 'string'
              ? JSON.parse(child.data) : (child.data || {});
            return {
              ...(typeof ref === 'object' ? ref : { id: ref }),
              ...parsed,
              id: String(child.id),
              created_at: child.created_at,
              updated_at: child.updated_at,
              created_by: child.created_by,
              updated_by: child.updated_by,
            };
          });
        }
      } else if (item[key]?.id) {
        // Single ref
        const children = await sync.exec(
          'SELECT * FROM data_items WHERE id = ?',
          [item[key].id]
        );
        if (children.rows.length > 0) {
          const child = children.rows[0];
          const parsed = typeof child.data === 'string'
            ? JSON.parse(child.data) : (child.data || {});
          item[key] = {
            ...item[key],
            ...parsed,
            id: String(child.id),
            created_at: child.created_at,
            updated_at: child.updated_at,
            created_by: child.created_by,
            updated_by: child.updated_by,
          };
        }
      }
    }
  }

  const out = format?.defaultSort ? format.defaultSort(items) : items;
  if (_DEV) console.log(`[sync:load] ${app}+${type} — ${out.length} items from local SQLite (${(performance.now() - t0).toFixed(1)}ms)`);
  return out;
}

let fullDataLoad = {}
// let runCount = 0

export async function dmsDataLoader (falcor, config, path='/') {
	// console.log('hola utils', utils)
	//---- Testing stuff to delete ----------
	// runCount += 1
	// const runId = runCount
	//-------------------------------------------
// console.log('dmsDataLoader', config, path)
	//-------------------------------------------
	if(!config || !falcor?.get) {
		return [{ message: "dmsDataLoader no config or falcor."}]
	}
	//console.log ('api', config)
	if(config?.formatFn){
		config.format = await config.formatFn();
	}

	 //console.log('api - dmsDataLoader - app, type', config?.format?.app, config?.format?.type)

	//---------------------------------------------------------
	// Pages can have many configs active at one time
	// Because any config can have children
	//---------------------------------------------------------
	const { format = {} } = config || {}
	//console.log('2 - ', config, config.dmsConfig.format)
	const { app , type, view_id, env, /*defaultSearch,*/ attributes = {} } = format


	const { getActiveConfig } = await import('../dms-manager/_utils-core.js')
	const activeConfigs = getActiveConfig(config.children, path)
	// console.log('------------dmsDataLoader-------------')
	const dmsAttrsConfigs = (Object.values(attributes))
		//.filter(d => !Array.isArray(filter?.attributes) || filter.attributes.includes(d.key))
		.filter(d => d.type === 'dms-format')
		.reduce((out,curr) => {
			out[curr.key] = curr
			return out
		},{})

	// --- Sync intercept: serve synced types from local SQLite ---
	const sync = _getSyncAPI();
	const mainAction = activeConfigs[0]?.action;
	if (sync && ['list', 'view', 'edit'].includes(mainAction)) {
		// If pattern isn't loaded yet, kick off bootstrap in the background
		// and fall through to Falcor for this request. Next navigation will
		// hit local SQLite once the bootstrap completes.
		if (!sync.isLocal(app, type) && sync.bootstrapPattern && type) {
			if (_DEV) console.log(`[dms:api] ${app}+${type} action=${mainAction} — not in sync scope, bootstrapping in background`);
			sync.bootstrapPattern(type); // fire and forget
		}
		if (sync.isLocal(app, type)) {
			const localResult = await loadFromLocalDB(sync, app, type, format, dmsAttrsConfigs, activeConfigs, path);
			if (localResult !== null) {
				if (_DEV) console.log(`[dms:api] ${app}+${type} action=${mainAction} → LOCAL (${localResult.length} items)`);
				return localResult;
			}
			if (_DEV) console.log(`[dms:api] ${app}+${type} action=${mainAction} → LOCAL empty, falling through to Falcor`);
		} else {
			if (_DEV) console.log(`[dms:api] ${app}+${type} action=${mainAction} → FALCOR (not in sync scope after bootstrap)`);
		}
	} else if (_DEV && mainAction) {
		if (!sync) {
			console.log(`[dms:api] ${app}+${type} action=${mainAction} → FALCOR (sync not ready)`);
		} else {
			console.log(`[dms:api] ${app}+${type} action=${mainAction} → FALCOR (action not intercepted)`);
		}
	}
	// --- End sync intercept ---

// console.log("dmsDataLoader::activeConfigs", activeConfigs);

	// -- Always want to know how many data items of a type we have
	let lengthReq = ['dms', 'data', `${ app }+${ type }`, 'length' ]

	if(activeConfigs.find(ac => ['list','load','filteredLength'].includes(ac.action))){
		// special routes for 'load', 'uda' action
		const options = activeConfigs.find(ac => ['list','load','filteredLength'].includes(ac.action))?.filter?.options;
		if(options) lengthReq = ['dms', 'data', `${ app }+${ type }`, 'options', options, 'length' ];
	}

	// UDA length requires invalidation first — must stay sequential
	const hasUdaLength = activeConfigs.find(ac => ['udaLength'].includes(ac.action));
	if(hasUdaLength){
		const options = hasUdaLength?.filter?.options;
		if(options) lengthReq = ['uda', env, 'viewsById', view_id, 'options', options, 'length' ];
        await falcor.invalidate(lengthReq)
    }

	// Length-only actions: fetch length alone and return immediately
	if(activeConfigs.find(ac => ['length', 'filteredLength', 'udaLength', 'udaLength'].includes(ac.action))){
		let length;
		try {
			length = get(await falcor.get(lengthReq), ['json',...lengthReq], 0)
		} catch (e) {
			console.error('Error getting length')
			length = 0;
		}
		return length;
	}

	let options = activeConfigs[0]?.filter?.options || '{}';
	const itemReqByIndex = ['dms', 'data', `${ app }+${ type }`, options !== '{}' ? 'opts' : false,
									options !== '{}' ? options : false, 'byIndex'].filter(i => i)

	// -- --------------------------------------------------------
	// -- Create the requests based on all active configs
	// -- Use null length so createRequest uses a ceiling value for
	// -- toIndex, allowing length + data in a single falcor.get()
	// -----------------------------------------------------------
	const newRequests = activeConfigs
		.map(config => createRequest(config, format, path, null))
		.filter(routes => routes?.length)

    //--------- Route Data Loading ------------------------
	// Combine length + data requests into a single falcor.get() to
	// eliminate one HTTP round-trip. The length is fetched alongside
	// the data instead of sequentially before it.
	if (newRequests.length > 0 ) {
        try{
            const udaReqsToInvalidate = newRequests.filter(r => r.includes('uda'));
            if(udaReqsToInvalidate.length){
                await falcor.invalidate(...udaReqsToInvalidate)
            }
            await falcor.get(lengthReq, ...newRequests)
        }catch (e){
            console.error('Error fetching data', e)
        }
	} else {
		try {
			await falcor.get(lengthReq)
		} catch (e) {
			console.error('Error getting length')
		}
	}
	const length = get(falcor.getCache(), ['json',...lengthReq], 0);
	// get api response
	let newReqFalcor = falcor.getCache()

	//console.log('data response', newReqFalcor, dataresp)

	if(activeConfigs.find(ac => ac.action === 'search')){
		const searchType = activeConfigs.find(ac => ac.action === 'search')?.filter?.searchType || 'byTag';
		const path =  newRequests[0].filter((r, i) => i <= newRequests[0].indexOf(searchType));
		return get(newReqFalcor, path, {});
	}
	if(activeConfigs.find(ac => ac.action === 'searchTags')){
		const path =  newRequests[0].filter((r, i) => i <= newRequests[0].indexOf('tags'));

		return get(newReqFalcor, path, {});
	}

	if(activeConfigs.find(ac => ac.action === 'searchPageTitles')){
		const path =  newRequests[0].filter((r, i) => i <= newRequests[0].indexOf('pageTitles'));

		return get(newReqFalcor, path, {});
	}
	if(activeConfigs.find(ac => ac.action === 'load')){
		// special return for 'load' action
		const path =  newRequests[0].filter((r, i) => i <= newRequests[0].indexOf('byIndex'));
		return Object.values(get(newReqFalcor, path, {}));
	}
	if(activeConfigs.find(ac => ac.action === 'uda')){
		// special return for 'uda' action
		const path =  newRequests[0].filter((r, i) => i <= newRequests[0].indexOf('dataByIndex'));
		const {from, to} = newRequests[0][newRequests[0].indexOf('dataByIndex') + 1]
		return Array.from({length: (to + 1 - from)}, (v, k) => get(newReqFalcor, [...path, k+from], {}));
	}


	// get active ids
	const activeIds =  activeConfigs
		.filter(config => config.action !== 'load')
		.map(config => getIdPath(config, format))
		.filter(routes => routes?.length)
		.map(path => {
			let v = get(newReqFalcor, path.slice(0, -1), false)
			if(v?.$type === 'ref') {
				// $ref value is ["dms", "data", app, "byId", id] — id is last element
				return +v.value[v.value.length - 1]
			}
			return +(v?.id)
		})
		.filter(d => d)

	// if from and to index are passed, filter ids based on them to avoid returning wrong number of rows
	let id = activeConfigs[0]?.params?.id;

	// console.log('loading data id', id,activeIds)

	let fromIndex =
		typeof activeConfigs?.[0]?.filter?.fromIndex === 'function' ?
			activeConfigs?.[0]?.filter?.fromIndex(path) :
			(+activeConfigs?.[0]?.params?.[activeConfigs?.[0]?.filter?.fromIndex]);

	let toIndex =
		typeof activeConfigs?.[0]?.filter?.toIndex === "function" ?
			activeConfigs?.[0]?.filter?.toIndex(path) :
			(+activeConfigs?.[0]?.params?.[activeConfigs?.[0]?.filter?.toIndex]);


	const filteredIds = !id && fromIndex !== undefined && toIndex !== undefined ?
		Object.keys(get(newReqFalcor, [...itemReqByIndex], {}))
			.filter(index => +index >= +fromIndex && +index <= +toIndex - 1)
			.map(index => {
				const ref = get(newReqFalcor, [...itemReqByIndex, index]);
				return ref?.value ? +ref.value[ref.value.length - 1] : null;
			})
			.filter(d => d) : [];

	activeIds.push(...(filteredIds || []))
	// ---------------------------------------------------------------------------------------------------

	const out = await processNewData(
	  	newReqFalcor,
	  	activeIds,
		activeConfigs?.[0]?.filter?.stopFullDataLoad,
	  	filteredIds?.length,
	  	app, type,
	  	dmsAttrsConfigs,
	  	format,
	  	falcor
	)

	if( activeConfigs?.[0]?.lazyLoad && !fullDataLoad[`${ app }+${ type }`]) {
		// console.log('lazy loading')
		// loadFullData(fullDataLoad, app, type, itemReqByIndex, runId, length, dmsAttrsConfigs, format, falcor)
	}

	return out
}

export async function dmsDataEditor (falcor, config, data={}, requestType, /*path='/'*/ ) {
	// console.log('API - dmsDataEditor', config,data)
	const { app , type } = config.format
	//const activeConfig = getActiveConfig(config.children, path)

	const updateRow = async (row) => {
		const { id } = row
		const attributeKeys = Object.keys(row)
			.filter(k => !['id', 'updated_at', 'created_at'].includes(k))

		// console.log('dms editor', data, app, type)
		// console.log('dmsDataEditor',config)

		// --------------------------------------------------------------
		// ----- Code for Saving Dms Format in separate rows
		// ---------------------------------------------------------------
		const dmsAttrsConfigs = Object.values(config?.format?.attributes || {})
			.filter(d => d.type === 'dms-format')
			.reduce((out,curr) => {
				out[curr.key] = curr
				return out
			},{})

		const dmsAttrsToUpdate = attributeKeys.filter(d => {
			return Object.keys(dmsAttrsConfigs).includes(d)
		})

		const dmsAttrsData = dmsAttrsToUpdate.reduce((out,curr) => {
			out[curr] = row[curr]
			delete row[curr]
			return out
		},{})

		// --- Sync intercept: write locally first ---
		const sync = _getSyncAPI();
		// Use sync for: updates/deletes of known types, AND creates (type may not be in scope yet)
		const isSyncEligible = sync && requestType !== 'updateType' && (sync.isLocal(app, type) || (!id && attributeKeys.length > 0));
		if (_DEV) {
			console.log(`[dms:api] EDIT ${app}+${type} req=${requestType || 'save'} id=${id || 'new'} → ${isSyncEligible ? 'LOCAL SYNC' : sync ? 'FALCOR' : 'FALCOR (sync not ready)'}`);
		}
		if (isSyncEligible) {
			// Suppress invalidation during the batch — one invalidation at the end
			sync.beginBatch();
			try {
				// Handle dms-format children through sync (replaces updateDMSAttrs)
				for (const attr of Object.keys(dmsAttrsData)) {
					const [childApp, childType] = dmsAttrsConfigs[attr].format.split('+');
					const toUpdate = Array.isArray(dmsAttrsData[attr]) ? dmsAttrsData[attr] : [dmsAttrsData[attr]];
					const refs = [];
					for (const dU of toUpdate) {
						const d = { ...dU };
						const childId = d.id || false;
						const dirty = d._dirty || false;
						for (const key of ['id', 'ref', 'created_at', 'updated_at', 'created_by', 'updated_by', '_dirty']) {
							delete d[key];
						}
						if (childId) {
							if (dirty) {
								await sync.localUpdate(childId, d);
							}
							refs.push({ ref: `${childApp}+${childType}`, id: childId });
						} else {
							const newId = await sync.localCreate(childApp, childType, d);
							refs.push({ ref: `${childApp}+${childType}`, id: newId });
						}
					}
					row[attr] = Array.isArray(dmsAttrsData[attr]) ? refs : refs?.[0] || '';
				}

				// Handle the parent item
				if (requestType === 'delete' && id) {
					await sync.localDelete(id);
					return { response: `Deleted item ${id}` };
				} else if (id && attributeKeys.length > 0) {
					await sync.localUpdate(id, row);
					return { message: `Update successful: id ${id}.` };
				} else if (attributeKeys.length > 0) {
					const newId = await sync.localCreate(app, type, row);
					return { response: 'Item created.', id: newId };
				}
			} finally {
				// Single invalidation after all writes complete
				sync.endBatch();
			}
		}
		// --- End sync intercept ---

		// console.log('gonna updateDMSAttrs', dmsAttrsData, dmsAttrsConfigs, falcor)
		let updates = await updateDMSAttrs(dmsAttrsData, dmsAttrsConfigs, falcor)
		row = {...row, ...updates}


		//--------------------------------------------------
		// Delete
		//--------------------------------------------------
		if(requestType === 'delete' && id) {
			await falcor.call(
				["dms", "data", "delete"],
				[app, type, id]
			)
			await falcor.invalidate(['dms', 'data', `${ app }+${ type }`, 'length' ])
			return {response: `Deleted item ${id}`}
		}
		//--------------------------------------------------
		// Update Type ???
		//--------------------------------------------------
		else if(requestType === 'updateType' && id) {
			// update type column
			// console.log('falcor update type', requestType, id, data)
			if(!row.type) 	return {message: "No type found."}

			await falcor.call(["dms", "type", "edit"], [app, id, row.type]);
      await falcor.invalidate(['dms', 'data', app, 'byId', id])
			await falcor.invalidate(['dms', 'data', 'byId', id])
			return {message: "Update successful."}
		}
		//--------------------------------------------------
		// Update Data
		//--------------------------------------------------
		else if(id && attributeKeys.length > 0) {
			/*  if there is an id and data
			    do update
			*/
			// console.log('falcor update data', requestType, data, JSON.stringify(data).length)
			// todo - data verification
			// console.time(`falcor update data ${id}`)
			// console.log('update', id, data, row)
			await falcor.call(["dms", "data", "edit"], [app, id, row, type]);
      await falcor.invalidate(['dms', 'data', app, 'byId', id])
			await falcor.invalidate(['dms', 'data','byId', id])
			await falcor.invalidate(['dms', 'data', `${ app }+${ type }`])
			// console.timeEnd(`falcor update data ${id}`)
			return {message: `Update successful: id ${id}.`,  }
		}
		//--------------------------------------------------
		// Create New
		//--------------------------------------------------
		else if ( attributeKeys.length > 0 ) {
			/*  if there is only data
			    create new
			*/
	      	// to do - data verification
	      	const res = await falcor.call(
	      		["dms", "data", "create"],
	      		[app, type, row]
	      	);
	      	await falcor.invalidate(['dms', 'data', `${ app }+${ type }`])
	      	return {response: 'Item created.', id: Object.keys(res?.json?.dms?.data?.byId || {})[0]} // activeConfig.redirect ? redirect(activeConfig.redirect) :
		}

		return { message: "Not sure how I got here."}
	}

	let output = { messages: []}

	if( Array.isArray(data) ) {
		output.messages = await Promise.all(data.map(d => updateRow(d)))
	} else {
		output = await updateRow(data)
	}

	return output
}

const api = {
  dmsDataLoader,
  dmsDataEditor
}

export default api
