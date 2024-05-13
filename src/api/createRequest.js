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
	//----------- ---------------------------------------
	let fromIndex =	typeof wrapperConfig?.filter?.fromIndex === 'function' ?
			wrapperConfig?.filter?.fromIndex(path) :
		(+wrapperConfig.params?.[wrapperConfig?.filter?.fromIndex] || 0);
	
	let toIndex = typeof wrapperConfig?.filter?.toIndex === "function" ?
			wrapperConfig?.filter?.toIndex(path) :
			(+wrapperConfig.params?.[wrapperConfig?.filter?.toIndex] || length - 1);
	let options = wrapperConfig?.filter?.options || '{}';
	let tags = wrapperConfig?.filter?.tags || [];

	// wrapperConfig.action === 'edit' makes it pull either by id or full data. 
	// this makes 'new' slow, as there's no id this fixes that.
	if(wrapperConfig?.filter?.type === 'new') return [];

	switch (wrapperConfig.action) {
		case 'list': {
			return [
				'dms', 'data', `${ app }+${ type }`, 
				 options !== '{}' ? 'opts' : false,
				 options !== '{}' ? options : false,
				'byIndex', {from: fromIndex, to: toIndex },
				[ "id", "app", "type",...dataAttrs]
			].filter(d => d)
		}
		case 'view':
		case 'edit': {
			// if
			const idPath = getIdPath(wrapperConfig,format)
			// console.log('idPath', idPath)
			return  idPath ? idPath : 
				[
				'dms', 'data', `${ app }+${ type }`, 'byIndex',
				{from: fromIndex, to: toIndex },
				[ "id", "updated_at", "created_at","app", "type",...dataAttrs]
			]
		}
		case 'load': { // use a new route that can accept filter and calculate length
			return [
				'dms', 'data', `${ app }+${ type }`,
				'options', options,
				'byIndex', {from: fromIndex, to: toIndex },
				[
					//due to group by, simple data->>'col_name' is not sufficient.
					...(filterAttrs.length > 0 ? filterAttrs : ['data'])
				]
			]
		}
		case 'search':
			return ['dms', 'search', `${ app }+${ type }`,'byTag', tags];
		case 'searchTags':
			return ['dms', 'search', `${ app }+${ type }`,'tags'];
		default:
			return []
	}
	
}

export function getIdPath (wrapperConfig,format) {
	const { app , type, defaultSearch, attributes = [] } = format
	
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

	//console.log('hola', id , wildKey, defaultSearch, wrapperConfig, format)
	// if you have an id prefer that to a wildkey

	return id ? 
	[
			'dms', 'data', 'byId', id, 
		[ "id", "updated_at", "created_at","app", "type",...dataAttrs]
	] : wildKey ? [
		'dms', 'data', `${ app }+${ type }`,
		'searchOne',
		[JSON.stringify({
			wildKey: `data ->> '${wildKey}'`, 
			params: wrapperConfig.params['*'] || '',
			defaultSearch
		})],
		[ "id", "updated_at", "created_at","app", "type", ...dataAttrs]
	] :  null
				

	

}

export default createRequest