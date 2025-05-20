import React from 'react'
import { configMatcher, getActiveConfig, validFormat } from './_utils.js'
import { defaultCheck, defaultCheckAuth } from './_auth.js'
import Wrapper from './wrapper.jsx'


const Components = {
	NoRouteMatch: ({path}) =>{
		return (
			<div> These aren't the droids you are looking for 
				<div className='text-5xl'>
					404
				</div>
				<div>/{path}</div>
			</div>
		)
	},
	InvalidConfig: ({config}) => {
		return (
			<div> Invalid DMS Config : 
				<pre style={{background: '#dedede'}}>
					{JSON.stringify(config,null,3)} 
				</pre>
			</div>
		)
	}
}


let childKey = 0

export function getActiveView(config, path, format, user, depth=0) {
	// add '' to params array to allow root (/) route  matching
	let activeConfigs = configMatcher(config,path)

	// console.log('activeConfigs', activeConfigs)
	// get the component for the active config
	// or the default component
	return activeConfigs.map(activeConfig => {
		const comp = typeof activeConfig.type === 'function' ?
			activeConfig.type : () => <div>components deprecated</div>
		
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
		// JSX version: deprecated
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

// import ThemeContext from '../theme'
// import defaultTheme from '../theme/default-theme'

const { InvalidConfig, NoRouteMatch } = Components;

const DmsManager = (props) => {
	const { 
		config,
		path = '',
		user,
		navigate
	} = props

	//console.log('dms manager', props)
	if(!config) { 
		return <NoRouteMatch path={path} />
	}
	const {
		check = defaultCheck,
		checkAuth = defaultCheckAuth,
	} = config
	
	

	React.useEffect(()=>{
		// console.log(' dmsManager:31 - user', user, props, config.format)
		if(check && user) {
			let activeConfig = getActiveConfig(config.children, path, config.format)
			// console.log('activeConfig', activeConfig, props)
			check( checkAuth, props, activeConfig, navigate, path )
		}
	},[path])

	// React.useEffect(() => console.log('dms manager unmount') , [])
    

	// check for valid config
	if(!config.children || !validFormat(config.format)) {
		return <InvalidConfig config={config} />
	}

	// add default data to format
	// const enhancedFormat = React.useMemo(() => 
	// 	enhanceFormat(config.format)
	// ,[config.format])
	// console.log('dms manager user', user)
	
	const RenderView = React.useMemo(() => {
		return getActiveView(config.children, path, config.format, user)
	}, [path])

	if(!RenderView) {
		return <NoRouteMatch path={path} />
	}

	// console.log('DMS Manager: render')
	return React.useMemo(() => (
		<>{RenderView}</>
	),[RenderView])	
}

export default DmsManager