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

export const getData = async ({format, apiLoad, currentPage, pageSize, orderBy}) =>{
    // fetch all data items based on app and type. see if you can associate those items to its pattern. this will be useful when you have multiple patterns.
    const attributes = JSON.parse(format?.config || '{}')?.attributes || [];
    const fromIndex = currentPage*pageSize;
    const toIndex = currentPage*pageSize + pageSize-1;
    const children = [{
        type: () => {
        },
        action: 'list',
        path: '/',
        filter: {
            fromIndex: path => fromIndex,
            toIndex: path => toIndex,
            options: JSON.stringify({
                orderBy: Object.keys(orderBy).reduce((acc, curr) => ({...acc, [`data->>'${curr}'`]: orderBy[curr]}) , {})
            }),
            stopFullDataLoad: true
        },
    }]
    const data = await apiLoad({
        app: format.app,
        type: format.type,
        format,
        attributes,
        children
    });
    return data;

}

export const getLength = async ({format, apiLoad}) =>{
    const attributes = JSON.parse(format?.config || '{}')?.attributes || [];
    const children = [{
        type: () => {
        },
        action: 'length',
        path: '/',
        filter: {
            options: JSON.stringify({})
        },
    }]
    const length = await apiLoad({
        app: format.app,
        type: format.type,
        format,
        attributes,
        children
    });
    return length;
}