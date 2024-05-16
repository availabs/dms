import React from 'react'
import { useNavigate} from 'react-router-dom'
import comps from '../components'
import { getActiveView, getActiveConfig, validFormat } from './_utils'

import ThemeContext from '../theme'
import defaultTheme from '../theme/default-theme'

const { InvalidConfig, NoRouteMatch } = comps

const DmsManager = (props) => {
	const { 
		config,
		path = '',
		theme = defaultTheme,
		user
	} = props
	
	const navigate = useNavigate()

	React.useEffect(()=>{
		if(config.check) {
			let activeConfig = getActiveConfig(config.children, path, config.format)
			config.check( props, activeConfig, navigate )
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

	return React.useMemo(() => (
		<>{RenderView}</>
	),[RenderView])	
}

export default DmsManager