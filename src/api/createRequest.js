const createRequest = (wrapperConfig,format, path, length) => {

	const { app , type, defaultSearch, attributes = {} } = format
	const itemReqByIndex = ['dms', 'data', `${ app }+${ type }`, 'byIndex']
	const itemReqById = ['dms', 'data', 'byId']
	//---------------------------------------------------------
	// generate requests for config based on TYPE and FILTERS
	//---------------------------------------------------------
	let filterAttrs = wrapperConfig?.filter?.attributes || []
	let dataAttrs = filterAttrs.length > 0 ? 
		filterAttrs.map(attr =>  `data ->> '${attr}'` ) : ['data'];

	//---------------------------------------------------
	//----------- Code to Match attributes based on value
	//----------- to do: Default to id
	const wildKey = attributes?.reduce((out,attr) => {
		if(attr.matchWildcard){
			out = attr.key
		}
		return out
	},'') || ''

	// id is given priority for edit and view
	let id = wrapperConfig.params?.id;
	let stopFullDataLoad = wrapperConfig?.filter?.stopFullDataLoad;


	let fromIndex =
		typeof wrapperConfig?.filter?.fromIndex === 'function' ?
			wrapperConfig?.filter?.fromIndex(path) :
		(+wrapperConfig.params?.[wrapperConfig?.filter?.fromIndex] || 0);
	let toIndex =
		typeof wrapperConfig?.filter?.toIndex === "function" ?
			wrapperConfig?.filter?.toIndex(path) :
			(+wrapperConfig.params?.[wrapperConfig?.filter?.toIndex] || length - 1);

	if (!id && stopFullDataLoad) return [];

	switch (wrapperConfig.action) {
		case 'list': 
			return [
				...itemReqByIndex,
				{from: fromIndex, to: toIndex - 1},
				[ "id", "updated_at", "created_at","app", "type",...dataAttrs]
			]
		break;
		case 'view':
		case 'edit':
			
			return wildKey ? [
				'dms', 'data', `${ app }+${ type }`,
				'searchOne',
				[JSON.stringify({
					wildKey: `data ->> '${wildKey}'`, 
					params: wrapperConfig.params['*'] || '',
					defaultSearch
				})],
				[ "id", "updated_at", "created_at","app", "type", ...dataAttrs]
			] :
				id ?
					[...itemReqById, id, [ "id", "updated_at", "created_at","app", "type",...dataAttrs]] :
				[
				...itemReqByIndex,
				{from: fromIndex, to: toIndex - 1},
				[ "id", "updated_at", "created_at","app", "type",...dataAttrs]
			]
		break;
		case 'load': // use a new route that can accept filter
			return [
				...itemReqByIndex,
				{from: fromIndex, to: toIndex - 1},
				[ "id", "updated_at", "created_at","app", "type",...dataAttrs]
			]
		default:
			return []
	}
	
}

export default createRequest