import { falcor } from '~/index'
//import { useFalcor } from '~/modules/avl-falcor'
import { getActiveConfig /*, filterParams*/ } from '../dms-manager/_utils'
// import { redirect } from "react-router-dom";
import get from 'lodash/get'

function rand(min, max) { // min and max included 
  return Math.floor(Math.random() * (max - min + 1) + min)
}

let fullDataLoad = {}
let runCount = 0

export async function dmsDataLoader ( config, path='/') {
	runCount += 1
	const runId = runCount  //rand(0,10000)
	console.log(`----------START API RUN ${runId}----------`)
	console.time(`----------dmsDataLoader ${runId}----------`)
	const { format } = config
	const { app , type, defaultSearch } = format

	const activeConfigs = getActiveConfig(config.children, path)
	const activeConfig = activeConfigs[0] || {} //
	const attributeFilter = get(activeConfig,'options.attributes', [])
	
	const wildKey = format?.attributes?.reduce((out,attr) => {
		if(attr.matchWildcard){
			out = attr.key
		}
		return out
	},'') || ''

	// let params = activeConfig.params
	// console.log('dmsDataLoader', activeConfig, 'path:',path)


	const lengthReq = ['dms', 'data', `${ app }+${ type }`, 'length' ]
	const length = get(await falcor.get(lengthReq), ['json',...lengthReq], 0)
	const itemReq = ['dms', 'data', `${ app }+${ type }`, 'byIndex'] 

	// console.log('dmsApiController - path, params', path, params)
	// console.log('falcorCache', JSON.stringify(falcor.getCache(),null,3))
	const createRequest = (wrapperConfig) => {
		let filterAttrs = wrapperConfig?.filter?.attributes || []
		let dataAttrs = filterAttrs.length > 0 ? 
			filterAttrs.map(attr =>  `data ->> '${attr}'` ) : ['data']

		switch (wrapperConfig.action) {
			case 'list': 
				return [
					...itemReq,
					{from: 0, to: length-1},
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
						params: activeConfig?.params['*'] || '', 
						defaultSearch
					})],
					[ "id", "updated_at", "created_at","app", "type", ...dataAttrs]
				] : [
					...itemReq,
					{from: 0, to: length-1},
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
  	//console.log('newRequests', newRequests)
  	// console.log(fullDataLoad[`${ app }+${ type }`],
  	// 	fullDataLoad[`${ app }+${ type }`] !== 'finished')
	if(fullDataLoad[`${ app }+${ type }`] !== 'finished') {
		//console.time(`fetch data ${runId}`)
		const newReqData = newRequests.length > 0 
			? await falcor.get(...newRequests) : {}
		//console.timeEnd(`fetch data ${runId}`)
	}
	//console.time('falcor Cache')
	let newReqFalcor = falcor.getCache()
	//console.timeEnd('falcor Cache')

	//---------------------------------------------------
	
	// --------------- Old data loading -------------------
  	// console.time(`dmsDataLoader ${ app }+${ type } ${length}`)
	
	// console.timeEnd(`dmsDataLoader ${ app }+${ type } ${length}`)
	// -------------------------------------------------------
  	

	//console.time(`process new data ${runId}`)
	const newData = Object.values(get(
  		newReqFalcor, 
  		['dms', 'data', 'byId'],
  		{}
  	))
  	.filter(d => d.id && d.app === app && d.type === type)
  	.map(d => {
  		// flatten data into single object
  		let out = d?.data?.value || {}
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
  		return out
  	})
  	//console.timeEnd(`process new data ${runId}`)

  	// console.log('newData', newData)
  	if( !fullDataLoad[`${ app }+${ type }`] ){
  		//console.time(`fullDataLoad ${runId}`)
  		fullDataLoad[`${ app }+${ type }`] = 'started';
  		falcor.get([
			...itemReq, 
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

  	// const data = length ? Object.values(get(
  	// 	reqData, 
  	// 	['json', ...itemReq],
  	// 	{}
  	// ))
  	// .filter(d => d.id)
  	// .map(d => {
  	// 	// flatten data into single object
  	// 	d.data.id = d.id
  	// 	d.data.updated_at = d.updated_at
  	// 	d.data.created_at = d.created_at
  		
  	// 	/* 
  	// 	   if the config has attributes filter
  	// 	   only select listed attributes
  	// 	   otherwise send all attributes
  	// 	*/
  	// 	return attributeFilter.length ? 
  	// 	attributeFilter.reduce((out, attr) => {
  	// 		out[attr] = d.data[attr]
  	// 		return out
  	// 	},{}) : 
  	// 	d.data
  	// }) : []
  	
  	//console.log('data', data, activeConfig)
  	// return data 
  	// switch (activeConfig.action) {
  	// 	case 'list': 
  	// 		return data
  	// 	case 'view':
  	// 		return data.filter(d => filterParams(d,params,config.format))
  	// 	case 'edit':
  	// 		return data.filter(d => filterParams(d,params,config.format))
  	// 	default:
  	// 		return data
  	// }
}

export async function dmsDataEditor ( config, data={}, requestType, path='/' ) {
	//console.log('API - dmsDataEditor', config,data,path)
	const { app , type } = config.format
	//const activeConfig = getActiveConfig(config.children, path)
	

	const { id } = data
	const attributeKeys = Object.keys(data)
		.filter(k => !['id', 'updated_at', 'created_at'].includes(k))

	

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
		return {response: `Deleted item ${id}`}
	} else if(id && attributeKeys.length > 0) {
		/*  if there is an id and data 
		    do update               
		*/

		// todo - data verification 
		
		await falcor.call(["dms", "data", "edit"], [id, data]);
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
      	
      	return {response: 'Item created.'} // activeConfig.redirect ? redirect(activeConfig.redirect) : 
	}

	return { message: "Not sure how I got here."}

} 