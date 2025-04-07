// import { falcor } from '~/index'
import { getActiveConfig /*, filterParams*/ } from '../dms-manager/_utils'
import { get } from "lodash-es"
import createRequest, {getIdPath} from './createRequest'
import {processNewData} from "./proecessNewData";
// import {loadFullData} from "./loadFullData";
import {updateDMSAttrs} from "./updateDMSAttrs";

// function rand(min, max) { // min and max included 
//   return Math.floor(Math.random() * (max - min + 1) + min)
// }



let fullDataLoad = {}
// let runCount = 0

export async function dmsDataLoader (falcor, config, path='/') {
	//---- Testing stuff to delete ----------
	// runCount += 1
	// const runId = runCount
	//-------------------------------------------
	// console.log('dmsDataLoader', config, path)
	//-------------------------------------------


	if(config.formatFn){
		config.format = await config.formatFn();
	}

	//console.log('dmsDataLoader', config)

	//---------------------------------------------------------
	// Pages can have many configs active at one time
	// Because any config can have children
	//---------------------------------------------------------
	const { format } = config
	//console.log('2 - ', config, config.dmsConfig.format)
	const { app , type, view_id, env, /*defaultSearch,*/ attributes = {} } = format

	const activeConfigs = getActiveConfig(config.children, path)
	// console.log('------------dmsDataLoader-------------')
	const dmsAttrsConfigs = (Object.values(attributes))
		//.filter(d => !Array.isArray(filter?.attributes) || filter.attributes.includes(d.key))
		.filter(d => d.type === 'dms-format')
		.reduce((out,curr) => {
			out[curr.key] = curr
			return out
		},{})



	// -- Always want to know how many data items of a type we have
	let lengthReq = ['dms', 'data', `${ app }+${ type }`, 'length' ]

	if(activeConfigs.find(ac => ['list','load','filteredLength'].includes(ac.action))){
		// special routes for 'load', 'uda' action
		const options = activeConfigs.find(ac => ['list','load','filteredLength'].includes(ac.action))?.filter?.options;
		if(options) lengthReq = ['dms', 'data', `${ app }+${ type }`, 'options', options, 'length' ];
	}
	if(activeConfigs.find(ac => ['udaLength'].includes(ac.action))){
		// special routes for 'load', 'uda' action
		const options = activeConfigs.find(ac => ['udaLength'].includes(ac.action))?.filter?.options;
		if(options) lengthReq = ['uda', env, 'viewsById', view_id, 'options', options, 'length' ];
	}

	const length = get(await falcor.get(lengthReq), ['json',...lengthReq], 0)
	// console.log('length',length)
	if(activeConfigs.find(ac => ['length', 'filteredLength', 'udaLength', 'udaLength'].includes(ac.action))){
		return length;
	}
	let options = activeConfigs[0]?.filter?.options || '{}';
	const itemReqByIndex = ['dms', 'data', `${ app }+${ type }`, options !== '{}' ? 'opts' : false,
									options !== '{}' ? options : false, 'byIndex'].filter(i => i)
	
	// -- --------------------------------------------------------
	// -- Create the requests based on all active configs
	// -----------------------------------------------------------
	const newRequests = activeConfigs
		.map(config => createRequest(config, format, path, length))
		.filter(routes => routes?.length)

	//console.log('newRequests',newRequests)
    //--------- Route Data Loading ------------------------
	//let dataresp = null
	if (newRequests.length > 0 ) {
		await falcor.get(...newRequests)
	}
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
				return +v.value[3]
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
			.map(index => get(newReqFalcor, [...itemReqByIndex, index, 'value', 3])) // ['dms', 'data', 'byId', id]
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

			await falcor.call(["dms", "type", "edit"], [id, row.type]);
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
			// console.log('update', id, data)
			await falcor.call(["dms", "data", "edit"], [id, row]);
			await falcor.invalidate(['dms', 'data', 'byId', id])
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
	      	await falcor.invalidate(['dms', 'data', `${ app }+${ type }`, 'length' ])
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