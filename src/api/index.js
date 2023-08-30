import { falcor } from '~/index'
//import { useFalcor } from '~/modules/avl-falcor'
import { getActiveConfig /*, filterParams*/ } from '../dms-manager/_utils'
// import { redirect } from "react-router-dom";
import get from 'lodash/get'
import isEqual from 'lodash/isEqual'

function rand(min, max) { // min and max included 
  return Math.floor(Math.random() * (max - min + 1) + min)
}

let fullDataLoad = {}
let runCount = 0

export async function dmsDataLoader ( config, path='/') {
	//---- Testing stuff to delete ----------
	runCount += 1
	const runId = runCount
	console.time(`----------dmsDataLoader ${runId}----------`)
	//-------------------------------------
	const { format } = config
	const { app , type, defaultSearch, attributes = {} } = format
	const dmsAttrsConfigs = (Object.values(attributes))
			.filter(d => d.type === 'dms-format')
			.reduce((out,curr) => {
				out[curr.key] = curr
				return out
			},{})


	//---------------------------------------------------------
	// Pages can have many configs active at one time
	// Because any config can have children
	//---------------------------------------------------------
	const activeConfigs = getActiveConfig(config.children, path)
	

	//---------------------------------------------------
	//----------- Code to Match attributes based on value
	//----------- to do: Default to id
	const wildKey = format?.attributes?.reduce((out,attr) => {
		if(attr.matchWildcard){
			out = attr.key
		}
		return out
	},'') || ''

	// -- Always want to know how many data items of a type we have
	const lengthReq = ['dms', 'data', `${ app }+${ type }`, 'length' ]
	const length = get(await falcor.get(lengthReq), ['json',...lengthReq], 0)
	const itemReqByIndex = ['dms', 'data', `${ app }+${ type }`, 'byIndex']
	const itemReqById = ['dms', 'data', `${ app }+${ type }`, 'byId']

	// -- --------------------------------------------------------
	// -- Create the requests based on all active configs
	// -----------------------------------------------------------
	const createRequest = (wrapperConfig) => {
		//---------------------------------------------------------
		// generate requests for config based on TYPE and FILTERS
		//---------------------------------------------------------
		let filterAttrs = wrapperConfig?.filter?.attributes || []
		let dataAttrs = filterAttrs.length > 0 ? 
			filterAttrs.map(attr =>  `data ->> '${attr}'` ) : ['data'];

		// id is given priority for edit and view
		let id = wrapperConfig.params?.id;

		let fromIndex =
			typeof wrapperConfig?.filter?.fromIndex === 'function' ?
				wrapperConfig?.filter?.fromIndex(path) :
			(+wrapperConfig.params?.[wrapperConfig?.filter?.fromIndex] || 0);
		let toIndex =
			typeof wrapperConfig?.filter?.toIndex === "function" ?
				wrapperConfig?.filter?.toIndex(path) :
				(+wrapperConfig.params?.[wrapperConfig?.filter?.toIndex] || length - 1);

		switch (wrapperConfig.action) {
			case 'list': 
				return [
					...itemReqByIndex,
					{from: fromIndex, to: toIndex - 1},
					[ "id", "updated_at", "created_at","app", "type",...dataAttrs]
				]
			break;
			case 'view':
			case 'edit':
				
				return wildKey ? [
					'dms', 'data', `${ app }+${ type }`,
					'searchOne',
					[JSON.stringify({
						wildKey: `data ->> '${wildKey}'`, 
						params: wrapperConfig.params['*'] || '',
						defaultSearch
					})],
					[ "id", "updated_at", "created_at","app", "type", ...dataAttrs]
				] :
					id ?
						[...itemReqById, id, [ "id", "updated_at", "created_at","app", "type",...dataAttrs]] :
					[
					...itemReqByIndex,
					{from: fromIndex, to: toIndex - 1},
					[ "id", "updated_at", "created_at","app", "type",...dataAttrs]
				]
			break;
			default:
				return []
		}
		
	}

	const newRequests = activeConfigs
		.map(c => createRequest(c))

  //--------- New Data Loading ------------------------
  // console.log('newRequests', newRequests)
  // console.log(fullDataLoad[`${ app }+${ type }`],
  // 	fullDataLoad[`${ app }+${ type }`] !== 'finished')
	// if(fullDataLoad[`${ app }+${ type }`] !== 'finished') {
	// console.time(`fetch data ${runId}`)
	const newReqData = newRequests.length > 0
		? await falcor.get(...newRequests) : {}
	// console.timeEnd(`fetch data ${runId}`)
	// }

	// console.time('falcor Cache')
	let newReqFalcor = falcor.getCache()
	// console.log('newReqFalcor', newReqFalcor)
	// console.timeEnd('falcor Cache')


    //console.time(`process new data ${runId}`)

    let id = activeConfig.params?.id;

    let fromIndex =
        typeof activeConfig?.filter?.fromIndex === 'function' ?
            activeConfig?.filter?.fromIndex(path) :
            (+activeConfig.params?.[activeConfig?.filter?.fromIndex]);
    let toIndex =
        typeof activeConfig?.filter?.toIndex === "function" ?
            activeConfig?.filter?.toIndex(path) :
            (+activeConfig.params?.[activeConfig?.filter?.toIndex]);

    const filteredIds = !id && fromIndex && toIndex &&
        Object.keys(get(newReqFalcor, [...itemReqByIndex], {}))
            .filter(index => +index >= +fromIndex && +index <= +toIndex - 1)
            .map(index => get(newReqFalcor, [...itemReqByIndex, index, 'value', 3], {})) // ['dms', 'data', 'byId', id]

	let newData = []
	const newDataVals = Object.values(get(
  		newReqFalcor,
  		['dms', 'data', 'byId'],
  		{}
  	))
  	.filter(d => d.id && d.app === app && d.type === type && (!filteredIds || filteredIds.includes(d.id)))


  	for(const k in newDataVals) {
  		// flatten data into single object
  		let d = newDataVals[k]
  		let out = d?.data?.value || {}
  		//console.log('d', d, out, )

  		Object.keys(d)
  			.filter(k => k !== 'data')
  			.forEach(col => {
  				if(col.includes('data ->> ')){
		          let attr = col.split('->>')[1].trim().replace(/[']/g, '')
		          out[attr] = d[col]
		        } else {
		        	out[col] = d[col]
		        }

  			})

  		// ----------------------------------------
  		// if attrs are format and have refs
  		// load that data
  		// to do: make this non-blocking / lazy load
  		// ----------------------------------------
  		let dmsKeys = Object.keys(out)
  			.filter(d => Object.keys(dmsAttrsConfigs).includes(d))

  		for (const key of dmsKeys) {

  			const dmsFormatRequests = []
  			for (let ref of out[key]) {
  				if(ref.id) {
	  				//let newData = await falcor.get()
	  				dmsFormatRequests.push(['dms','data', 'byId', ref.id, 'data'])
	  			}
  			}

  			if(dmsFormatRequests.length > 0) {
	  			let newData = await falcor.get(...dmsFormatRequests)
	  			let index = 0
	  			for (let ref of out[key]) {
	  				if(ref.id) {
		  				let value = get(newData, ['json','dms','data', 'byId', ref.id, 'data'])
		  				out[key][index]= {...ref,...value}
		  				index += 1
		  			}
	  			}
	  		}
  		}
  		newData.push(out)
  	}

  	//console.log('newData', newData)
  	// let dmsFormatRequests = dmsFormats.map(d => {
  	// 	return ['dms','data', 'byId', +d.id, 'data']
  	// })
  	// falcor.get(...dmsFormatRequests).then(res => {
  	// 	console.log('get dmsFormatRequests', res)
  	// })
  	// console.log('dmsKeys', dmsFormatRequests )
  	//console.timeEnd(`process new data ${runId}`)

  	// console.log('newData', newData)
  	if( !fullDataLoad[`${ app }+${ type }`] ){
  		//console.time(`fullDataLoad ${runId}`)
  		fullDataLoad[`${ app }+${ type }`] = 'started';
  		falcor.get([
			...itemReqByIndex,
			{from: 0, to: length-1}, 
			["id", "data", "updated_at", "created_at"] //"app", "type",
		]).then(d => {
  			//console.timeEnd(`fullDataLoad ${runId}`)
  			fullDataLoad[`${ app }+${ type }`] = 'finished';
		})
  	}
  	console.timeEnd(`----------dmsDataLoader ${runId}----------`)
  	// console.log(`----------START API RUN ${runId}----------`)
  	return newData
}

export async function dmsDataEditor ( config, data={}, requestType, path='/' ) {
	//console.log('API - dmsDataEditor', config,data,path)
	const { app , type } = config.format
	//const activeConfig = getActiveConfig(config.children, path)
	

	const { id } = data
	const attributeKeys = Object.keys(data)
		.filter(k => !['id', 'updated_at', 'created_at'].includes(k))

	console.log('dmsDataEditor',config)

	// --------------------------------------------------------------
	// ----- Code for Saving Dms Format in seperate rows
	// ---------------------------------------------------------------

	async function updateDMSAttrs(data, configs, parentId) {
		let updates = {}
		for( const attr of Object.keys(data) ) {
				updates[attr] = []
				let [app,type] = configs[attr]?.format.split('+')
				console.log('create requests', app, type, attr)
				const toUpdate = Array.isArray(data[attr]) ?
					data[attr] : [data[attr]]


				for (const d of toUpdate) {
					let id = d?.id || false
					if(id) {
						// if id edit
						let currentData = get(
							falcor.getCache(['dms','data','byId',id, 'data']),
							['dms','data','byId',id, 'data','value']
							,{}
						)
						// ---
						delete d.ref
						delete d.id
						delete currentData.ref
						delete currentData.id
						// ---
						console.log(currentData,d)

						if(!isEqual(currentData,d)){
							console.log('update', id )
							await falcor.call(
								["dms", "data", "edit"],
								[id, d]
							)
							await falcor.invalidate(['dms', 'data', 'byId', id])
						}
						updates[attr].push({ref:`${app}+${type}`, id})
					} else {
						// else create
						console.log('create dms-format', `${app}+${type}`)
						const res = await falcor.call(
		      		["dms", "data", "create"],
		      		[app, type, d]
		      	)
		      	let newId = Object.keys(res?.json?.dms?.data?.byId || {})
		      		.filter(d => d !== "$__path")?.[0] || -1
		      	console.log(newId)
		      	if(newId !== -1) {
		      		updates[attr].push({ref:`${app}+${type}`, id:newId})
		      	}
					}
					// to do, handle delete
				}

				// if data isn't array convert it back
				updates[attr] = Array.isArray(data[attr]) ? updates[attr] : updates[attr]?.[0] || ''
		}
		return updates
	}

	// guard rails so I don't mess up other data.
	//if(type === 'dev-page') {
		const dmsAttrsConfigs = (Object.values(config?.format?.attributes || {}))
			.filter(d => d.type === 'dms-format')
			.reduce((out,curr) => {
				out[curr.key] = curr
				return out
			},{})

		const dmsAttrsToUpdate = attributeKeys.filter(d => {
			return Object.keys(dmsAttrsConfigs).includes(d)
		})

		const dmsAttrsData = dmsAttrsToUpdate.reduce((out,curr) => {
			out[curr] = data[curr]
			delete data[curr]
			return out
		},{})

		let updates = await updateDMSAttrs(dmsAttrsData, dmsAttrsConfigs)
		data = {...data, ...updates}
	//}

	console.log('dmsDataEditor', data  )


	//--------------------------------------------------

	// const updateData = attributeKeys.reduce((out,key) => {
	// 	out[key] = data[key]
	// 	return out
	// },{})
	
	//console.log('dmsDataEditor', id, attributeKeys, updateData, requestType, path)

	if(requestType === 'delete' && id) {
		await falcor.call(
			["dms", "data", "delete"], 
			[app, type, id]
		)
		await falcor.invalidate(['dms', 'data', `${ app }+${ type }`, 'length' ])
      	
		return {response: `Deleted item ${id}`}
	} else if(id && attributeKeys.length > 0) {
		/*  if there is an id and data 
		    do update               
		*/

		console.log('falcor update data', data, JSON.stringify(data).length)
		// todo - data verification 
		console.time(`falcor update data ${id}`)
		await falcor.call(["dms", "data", "edit"], [id, data]);
		await falcor.invalidate(['dms', 'data', 'byId', id])
		console.timeEnd(`falcor update data ${id}`)
		return {message: "Update successful."}
	} else if ( attributeKeys.length > 0 ) {
		/*  if there is only data 
		    create new                
		*/
		
      	// to do - data verification
      	await falcor.call(
      		["dms", "data", "create"], 
      		[app, type, data]
      	);
      	await falcor.invalidate(['dms', 'data', `${ app }+${ type }`, 'length' ])
      	
      	return {response: 'Item created.'} // activeConfig.redirect ? redirect(activeConfig.redirect) : 
	}

	return { message: "Not sure how I got here."}

} 