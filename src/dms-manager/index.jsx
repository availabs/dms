import React from 'react'
import { useNavigate} from 'react-router-dom'
import comps from '../components'
import { getActiveView, getActiveConfig, validFormat } from './_utils'
import { defaultCheck, defaultCheckAuth } from './_auth'


// import ThemeContext from '../theme'
// import defaultTheme from '../theme/default-theme'

const { InvalidConfig, NoRouteMatch } = comps

const DmsManager = (props) => {
	const { 
		config,
		path = '',
		user
	} = props

	//console.log('dms manager', props)
	
	const {
		check = defaultCheck,
		checkAuth = defaultCheckAuth,
	} = config
	
	const navigate = useNavigate()

	React.useEffect(()=>{
		//console.log(' dmsManager:31 - user', user, props, config.format)
		if(check && user) {
			let activeConfig = getActiveConfig(config.children, path, config.format)
			//console.log('activeConfig', activeConfig, props)
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