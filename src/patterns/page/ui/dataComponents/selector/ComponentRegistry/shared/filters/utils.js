import {uniq} from "lodash-es";
export const isJson = (str)  => {
    try {
        JSON.parse(str);
    } catch (e) {
        return false;
    }
    return true;
}
// applies data->> and AS on a column name
export const formattedAttributeStr = (col, isDms, isCalculatedCol) => isCalculatedCol ? col : isDms ? `data->>'${col}' as ${col.toLowerCase()}` : col;

export const getData = async ({format, apiLoad,
                                  // length,
                                  reqName, refName, allAttributes, filterBy={}}) =>{
    const prependWithDistinct = !reqName.toLowerCase().startsWith('distinct');
    const appendWithAS = !reqName.toLowerCase().includes(' as ');
    const mappedAttributeName = `${prependWithDistinct ? `distinct ` : ``}${reqName}${appendWithAS ? ` as ${reqName}` : ``}` // to get uniq values

    const {name, display, meta_lookup} = allAttributes.find(attr => attr.name === reqName) || {};
    const meta = ['meta-variable', 'geoid-variable', 'meta'].includes(display) && meta_lookup ? {[name]: meta_lookup} : {};

    const length = await getLength({
        format, apiLoad,
        groupBy: [refName],
        filterBy
    });
    const fromIndex = 0;
    const toIndex = length-1;
    const children = [{
        type: () => {
        },
        action: 'uda',
        path: '/',
        filter: {
            fromIndex: path => fromIndex,
            toIndex: path => toIndex,
            options: JSON.stringify({
                filter: filterBy,
                // exclude: {[attribute]: ['null']},
                meta,
                keepOriginalValues: true
            }),
            attributes: [mappedAttributeName],
            stopFullDataLoad: true
        },
    }]
    const data = await apiLoad({
        app: format.app,
        type: format.type,
        format,
        attributes: [mappedAttributeName],
        children
    });
    // console.log('debug filters data:', attribute, mappedAttributeName, data)
    return data.map(row => ({[reqName]: row[mappedAttributeName]}));
}

export const getLength = async ({format, apiLoad, groupBy= [], filterBy}) =>{
    const finalAttributes = isJson(format?.config) ? (format.config?.attributes || []) :
        (JSON.parse(format?.config || '{}')?.attributes || format?.metadata?.columns || []);

    const children = [{
        type: () => {
        },
        action: 'udaLength',
        path: '/',
        filter: {options: JSON.stringify({filter: filterBy, groupBy})},
    }]
    return await apiLoad({
        app: format.app,
        type: format.type,
        format,
        attributes: finalAttributes,
        children
    });
}
export const isCalculatedCol = (col, attributes) => {
    const attr = (attributes || []).find(attr => attr.name === col);
    if(!attr) console.log(`${col} not found in filters.`, attributes)
    return attr.display === 'calculated' || attr.type === 'calculated' || attr.origin === 'calculated-column';
}

export const parseIfJson = value => {
    try {
        return JSON.parse(value)
    }catch (e){
        return value;
    }
}

export const getFilters = (columns= []) => columns.reduce((acc, column) => {
    // returns internal and external values, regardless of operation type. it is assumed to be the same for a column.
    if (!Array.isArray(column.filters)) return acc;

    const values = (column.filters).reduce((acc, f) => [...acc, ...(f.values || [])], []);
    acc[column.name] = uniq(values);
    return acc;
}, {});

export const getNormalFilters = (columns= []) => columns.reduce((acc, column) => {
    if (!Array.isArray(column.filters)) return acc;

    const values = (column.filters).reduce((acc, f) => [...acc, ...(f.values || [])], []);
    acc.push({column: column.name, values: uniq(values)}); // a normal column can have any number of filters
    return acc;
}, []);

export const getDataToTrack = columns => columns.map(({name, display_name, customName, internalFilter, externalFilter}) => ({name, display_name, customName, internalFilter, externalFilter}))

export const convertToUrlParams = (obj, delimiter) => {
    const params = new URLSearchParams();

    Object.keys(obj).forEach(column => {
        const values = obj[column];
        params.append(column, values.filter(v => Array.isArray(v) ? v.length : v).join(delimiter));
    });

    return params.toString();
};