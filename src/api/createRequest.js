const createRequest = (wrapperConfig,format, path, length) => {

	const { app , type } = format
	//---------------------------------------------------------
	// generate requests for config based on TYPE and FILTERS
	//---------------------------------------------------------
	let filterAttrs = wrapperConfig?.filter?.attributes || []
	let dataAttrs = filterAttrs.length > 0 ? 
		filterAttrs.map(attr =>  `data ->> '${attr}'` ) : ['data'];

	//---------------------------------------------------
	//----------- Param mathcing from filters
	//----------- 
	let fromIndex =	typeof wrapperConfig?.filter?.fromIndex === 'function' ?
			wrapperConfig?.filter?.fromIndex(path) :
		(+wrapperConfig.params?.[wrapperConfig?.filter?.fromIndex] || 0);
	
	let toIndex = typeof wrapperConfig?.filter?.toIndex === "function" ?
			wrapperConfig?.filter?.toIndex(path) :
			(+wrapperConfig.params?.[wrapperConfig?.filter?.toIndex] || length - 1);

	
	switch (wrapperConfig.action) {
		case 'list': 
			return [
				'dms', 'data', `${ app }+${ type }`, 'byIndex',
				{from: fromIndex, to: toIndex - 1},
				[ "id", "updated_at", "created_at","app", "type",...dataAttrs]
			]
		break;
		case 'view':
		case 'edit':
			// if 
			const idPath = getIdPath(wrapperConfig,format)
			return  idPath ? idPath : [
				'dms', 'data', `${ app }+${ type }`, 'byIndex',
				{from: fromIndex, to: toIndex - 1},
				[ "id", "updated_at", "created_at","app", "type",...dataAttrs]
			]
		break;
		default:
			return []
	}
	
}

export function getIdPath (wrapperConfig,format) {
	const { app , type, defaultSearch, attributes = {} } = format
	
	let filterAttrs = wrapperConfig?.filter?.attributes || []
	let dataAttrs = filterAttrs.length > 0 ? 
		filterAttrs.map(attr =>  `data ->> '${attr}'` ) : ['data'];

	const wildKey = attributes?.reduce((out,attr) => {
		if(attr.matchWildcard){
			out = attr.key
		}
		return out
	},'') || ''

	let id = wrapperConfig.params?.id;

	return wildKey ? [
		'dms', 'data', `${ app }+${ type }`,
		'searchOne',
		[JSON.stringify({
			wildKey: `data ->> '${wildKey}'`, 
			params: wrapperConfig.params['*'] || '',
			defaultSearch
		})],
		[ "id", "updated_at", "created_at","app", "type", ...dataAttrs]
	] : id ? 
	[
		'dms', 'data', 'byId', id, 
		[ "id", "updated_at", "created_at","app", "type",...dataAttrs]
	] : null
				

	

}

export default createRequest