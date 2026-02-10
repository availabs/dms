import { matchRoutes } from 'react-router'
import { cloneDeep } from 'lodash-es'


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
