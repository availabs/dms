export const isJson = (str)  => {
    try {
        JSON.parse(str);
    } catch (e) {
        return false;
    }
    return true;
}

export const getNestedValue = value =>
    value?.value && typeof value?.value === 'object' ? getNestedValue(value.value) :
        !value?.value && typeof value?.value === 'object' ? '' : value;

export const formattedAttributeStr = col => `data->>'${col}' as ${col}`;
export const attributeAccessorStr = col => `data->>'${col}'`;

const formatFilters = filters => filters.filter(f => f.values?.length && f.values.filter(fv => fv.length).length).reduce((acc, f) => ({...acc, [attributeAccessorStr(f.column)]: f.values}), {});

export const getData = async ({format, apiLoad, currentPage, pageSize, length, orderBy, filters}) =>{
    // fetch all data items based on app and type. see if you can associate those items to its pattern. this will be useful when you have multiple patterns.
    const attributes = JSON.parse(format?.config || '{}')?.attributes || [];
    const fromIndex = currentPage*pageSize;
    const toIndex = Math.min(length, currentPage*pageSize + pageSize);
    if(fromIndex > length - 1) return [];

    console.log('fetching', fromIndex, toIndex)
    const children = [{
        type: () => {
        },
        action: 'list',
        path: '/',
        filter: {
            fromIndex: path => fromIndex,
            toIndex: path => toIndex,
            options: JSON.stringify({
                orderBy: Object.keys(orderBy).reduce((acc, curr) => ({...acc, [`data->>'${curr}'`]: orderBy[curr]}) , {}),
                filter: formatFilters(filters)
            }),
            stopFullDataLoad: true
        },
    }]
    const data = await apiLoad({
        app: format.app,
        type: format.type || format.doc_type, //doc_type when format is not passed, but the user selects it in pageEdit.
        format: {...format, type: format.type || format.doc_type},
        attributes,
        children
    });
    return data;

}

export const getLength = async ({format, apiLoad, filters=[]}) =>{
    const attributes = JSON.parse(format?.config || '{}')?.attributes || [];
    const children = [{
        type: () => {
        },
        action: 'filteredLength',
        path: '/',
        filter: {
            options: JSON.stringify({filter: formatFilters(filters)})
        },
    }]
    const length = await apiLoad({
        app: format.app,
        type: format.type || format.doc_type, //doc_type when format is not passed, but the user selects it in pageEdit.
        format: {...format, type: format.type || format.doc_type},
        attributes,
        children
    });
    return length;
}

export const convertToUrlParams = (arr, delimiter) => {
    const params = new URLSearchParams();

    arr.forEach(item => {
        const { column, values = [] } = item;
        params.append(column, values.filter(v => v.length).join(delimiter));
    });

    return params.toString();
};