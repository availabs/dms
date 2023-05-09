import DevInfo from './dev-info'
import Landing from './landing'
import Table from './table'
import Card from './card'
import Edit from './edit'

function InvalidConfig ({config}) {
	return (
		<div> Invalid DMS Config : 
			<pre style={{background: '#dedede'}}>
				{JSON.stringify(config,null,3)} 
			</pre>
		</div>
	)
}

function NoRouteMatch ({path}) {
	return (
		<div> These aren't the droids you are looking for 
			<div className='text-5xl'>
				404
			</div>
			<div>/{path}</div>
		</div>
	)
}

export default {
	devinfo: DevInfo,
	'dms-landing': Landing,
	'dms-table': Table,
	'dms-card': Card,
	'dms-edit': Edit,
	InvalidConfig,
	NoRouteMatch

}