import React from 'react'
import { configMatcher, getActiveConfig, validFormat } from './_utils'
import { defaultCheck, defaultCheckAuth } from './_auth'
import Wrapper from './wrapper.jsx'

let childKey = 0

const DmsManager = (props) => {
	const {
		config,
		path = '',
		baseUrl,
		user,
		navigate,
		falcor,
		mode
	} = props

	// const location = useLocation()
  // React.useEffect(() => { console.log('DmsManager - user updated', user) },[user])
	// console.log('location dms-manager', location, baseUrl, path)
	function getActiveView(config, path, format, user, depth=0) {
		// add '' to params array to allow root (/) route  matching

		let activeConfigs = configMatcher(config,path)

		// get the component for the active config
		// or the default component
		return activeConfigs.map(activeConfig => {
			const comp = activeConfig.type //|| DefaultComponent

			// get the wrapper for the config, or the default wrapper
			//console.log('activeConfig Action',activeConfig.action)


			// if there are children
			let children = []
			if(activeConfig.children) {
				children = getActiveView(
					activeConfig.children,
					path,
					format,
					user,
					depth+1,
				)
			}
			// JSX version: deprecated
			return <Wrapper
				Component={comp}
				format={format}
				key={childKey++}
				{...activeConfig}
				children={children}
				user={user}
				mode={mode}
				falcor={falcor}
			/>

		})
	}

	if(!config) {
		return <div>No Route Match {path}</div>
	}

	const {
		check = defaultCheck,
		checkAuth = defaultCheckAuth,
	} = config

	React.useEffect(()=>{
		if(check) {
			let activeConfig = getActiveConfig(config.children, path, config.format)
			check( checkAuth, props, activeConfig, navigate, `${baseUrl}${path}` )
		}
	},[path, user])

	const RenderView = React.useMemo(() => {
		return getActiveView(config.children, path, config.format, user)
	}, [path])

	if(!RenderView) {
		return <div>No Route Match {path}</div>
	}

	// console.log('DMS Manager: render')
	return React.useMemo(() => (
		<>{RenderView}</>
	),[RenderView])
}

export default DmsManager
