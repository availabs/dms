import { matchRoutes } from 'react-router'
import { get, cloneDeep } from 'lodash-es'
import dmsColumnTypes from '../ui/columnTypes'
import Array from "../ui/columnTypes/array";
import React from "react";

// import Wrappers from '../wrappers' //comment this out and it breaks, why?!?!
// import Components from '../components'


export function configMatcher (config, path ) {
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

	return [...configs,...childConfigs]
}



export function validFormat(format) {
	return format &&
		format.attributes &&
		format.attributes.length > 0
}

export function json2DmsForm (data,requestType='update',config, path) {
  let out = new FormData()
  out.append('data', JSON.stringify(data))
  out.append('requestType', requestType)
  if(config) {
  	out.append('dmsConfig', JSON.stringify(config))
  }
  if(path) {
  	out.append('path', path)
  }
  return out
}

// export const json2DmsForm = (data,requestType='update') => {
//   let out = new FormData()
//   out.append('data', JSON.stringify(data))
//   out.append('requestType', requestType)
//   return out
// }

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



export function getAttributes (format, options={}, mode='') {
	//console.log('getAttributes', format, options)

	const formats = processFormat(format)
	const accessor = options?.accessor || 'key'
	// const attributeFilter = get(options, 'attributes', [])
	// console.log('getAttributes', format.attributes)
	const attributes = format.attributes
		//.filter(attr => attributeFilter.length === 0 || attributeFilter.includes(attr.key))
		.filter(attr => mode !== 'edit' ||
				(typeof attr.editable === 'undefined' ||
				!attr.editable === false)
		)
		.reduce((out,attr) => {
			if(attr.format && formats[attr.format]) {
				out[attr[accessor]] = {
					...attr,
					attributes: getAttributes(formats[attr.format])
				}
			} else {
				out[attr[accessor]] = attr
			}
			return out
		},{})

	const attributeKeys = Object.keys(attributes)

	//console.log('attributeKeys', attributes)

	Object.keys(attributes)
		.filter(attributeKey => attributeKeys.includes(attributeKey))
		.forEach(attributeKey => {
			attributes[attributeKey].ViewComp = getViewComp(
				get(attributes, `${attributeKey}`, {})
			)
			attributes[attributeKey].EditComp = getEditComp(
				get(attributes, `${attributeKey}`, {})
			)
		})

	return attributes
}

export function processFormat (format, formats = {}) {
  if (!format) return formats;

  const Format = cloneDeep(format);

  if (Format.registerFormats) {
    Format.registerFormats.forEach(f => processFormat(f, formats));
  }

  formats[`${ Format.app }+${ Format.type }`] = Format;

  return formats;
}

// export function registerDataType (name, dataType) {
//     dmsColumnTypes[name] = dataType
// }


export function getViewComp (attr) {
    const { type='default', isArray=false, attributes } = attr
    let Comp = get(dmsColumnTypes, `[${type}]`, dmsColumnTypes['default'])
    // console.log('attr',attr)
    let output = Comp.ViewComp
    if( isArray ) {
        let ArrayComp = attr.DisplayComp ? attr.DisplayComp.ViewComp : Array.ViewComp
        output = (props) => <ArrayComp Component={Comp} {...props} attr={attr} />
    }
    return output
}

export function getEditComp (attr) {
    const { type='default', isArray=false, attributes } = attr
    // console.log('get EditComp attr:', attr)
    let Comp = get(dmsColumnTypes, `[${type}]`, dmsColumnTypes['default'])
    let output = Comp.EditComp
    if( isArray ) {
        let ArrayComp = attr.DisplayComp ? attr.DisplayComp.EditComp : Array.EditComp
        output = (props) => <ArrayComp Component={Comp} {...props} attr={attr} />
    }
    return output
}
