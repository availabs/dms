import React from 'react'
import Wrappers from '../wrappers'
import Components from '../components'
import { matchRoutes } from 'react-router-dom'
import { cloneDeep } from "lodash-es"
import { get } from "lodash-es"

const DefaultComponent = Components.devinfo
const DefaultWrapper = Wrappers.error
let childKey = 0


function configMatcher (config, path ) {
	
	// matchRoutes picks best from all available routes in config

	const matches = matchRoutes(config.map(d => ({path:d.path, ...d})), {pathname:path}) || []

	// hash matches by route path
	let matchHash = matches.reduce((out,c) => {
		out[c.route.path] = c
		return out
	},{})

	// return fitlered configs for best matches
	// and add extracted params from matchRoutes
	return config.filter((d,i) => {
		let match = matchHash?.[d.path] || false
		if(match){
			d.params = match.params
		}
		return match
	})
}


export function getActiveView(config, path, format, user, depth=0) {
	// add '' to params array to allow root (/) route  matching
	let activeConfigs = configMatcher(config,path)

	// console.log('activeConfigs', activeConfigs)
	// get the component for the active config
	// or the default component
	return activeConfigs.map(activeConfig => {
		const comp = typeof activeConfig.type === 'function' ?
			activeConfig.type :
			Components[activeConfig.type] || DefaultComponent
		
		// get the wrapper for the config, or the default wrapper
		//console.log('activeConfig Action',activeConfig.action)
		const Wrapper = Wrappers[activeConfig.action] || DefaultWrapper
		
		// if there are children 
		let children = []
		if(activeConfig.children) {
			children = getActiveView(
				activeConfig.children,
				path,
				format,
				user,
				depth+1
			)
		}

		//console.log('wrapper', activeConfig.action, activeConfig.type, user)
		return <Wrapper
			Component={comp}
			format={format}
			key={childKey++}
			{...activeConfig}
			children={children}
			user={user}
		/>
	})
}


export function getActiveConfig (config=[], path='/', depth = 0) {
	
	let configs = cloneDeep(configMatcher(config,path, depth))

	let childConfigs = configs
		.reduce((out,conf) => {
			let childConf = conf.children?.length ? getActiveConfig(conf.children, path, depth+1) : [];
			if(childConf.length) {
				return [...out, ...childConf]
			}
			return out
		},[])
		
    //console.log(childConfigs)

	return [...configs,...childConfigs] || []
}



export function validFormat(format) {
	return format && 
		format.attributes && 
		format.attributes.length > 0
}



/*
export function enhanceFormat(format) {
	let out  = {...format}
	// console.log('enhance')
	if(out.attributes.filter(d => d.key ==='updated_at').length === 0){
		out.attributes.push({key: 'updated_at', type:'datetime', editable: false})
		out.attributes.push({key: 'created_at', type:'datetime', editable: false})
	}
	return out
}
*/


export function filterParams (data, params,format) {
	// filter data that has params
	// in params objects
	
	// let one attribute match wildcard * 
	let wildKey = format?.attributes?.reduce((out,attr) => {
		if(attr.matchWildcard){
			out = attr.key
		}
		return out
	},'') || ''

	//console.log('filterParams', data, params, wildKey)
	
	let filter = false
	Object.keys(params).forEach(k => {
		if(data[k] == params[k] || (Boolean(data[wildKey]) && data[wildKey] === params['*'])) {
			filter = true
		} else {
			filter = false
		}
	})

	if(params['id'] == data['id']) {
		return true
	}
	
	return filter
}

export const json2DmsForm = (data,requestType='update') => {
  let out = new FormData()
  out.append('data', JSON.stringify(data))
  out.append('requestType', requestType)
  return out
}

export const updateRegisteredFormats = (registerFormats, app, type) => {
	if (Array.isArray(registerFormats)) {
	  registerFormats = registerFormats.map((rFormat) => {
		rFormat.app = app;
		rFormat.type = `${type}|${rFormat.type}`;
		rFormat.registerFormats = updateRegisteredFormats(
		  rFormat.registerFormats,
		  app,
		  type
		);
		rFormat.attributes = updateAttributes(rFormat.attributes, app, type);
		return rFormat;
	  });
	}
	return registerFormats;
  };
  
  export const updateAttributes = (attributes, app, type) => {
	if (Array.isArray(attributes)) {
	  attributes = attributes.map((attr) => {
		attr.format = attr.format
		  ? `${app}+${type}|${attr.format.split("+")[1]}`
		  : undefined;
		return updateRegisteredFormats(attr, app, type);
	  });
	}
	return attributes;
  };