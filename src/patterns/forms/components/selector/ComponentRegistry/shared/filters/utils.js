import {isJson} from "../../../index";
import {uniq} from "lodash-es";

export const getData = async ({format, apiLoad, length, attribute, allAttributes, groupBy=[], filterBy={}}) =>{
    const prependWithDistinct = !attribute.toLowerCase().startsWith('distinct');
    const appendWithAS = !attribute.toLowerCase().includes(' as ');
    const mappedAttributeName = `${prependWithDistinct ? `distinct ` : ``}${attribute}${appendWithAS ? ` as ${attribute}` : ``}` // to get uniq values
    // const attributeNameForExclude = attribute.toLowerCase().be
    const {name, display, meta_lookup} = allAttributes.find(attr => attr.name === attribute) || {};
    const meta = ['meta-variable', 'geoid-variable', 'meta'].includes(display) && meta_lookup ? {[name]: meta_lookup} : {};
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
    return data.map(row => ({[attribute]: row[mappedAttributeName]}));
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
    const values = uniq([...(column.internalFilter || []), ...(column.externalFilter || [])]);
    if(values.length || Array.isArray(column.internalFilter) || Array.isArray(column.externalFilter)) acc[column.name] = values;
    return acc;
}, {});

export const getDataToTrack = columns => columns.map(({name, display_name, customName, internalFilter, externalFilter}) => ({name, display_name, customName, internalFilter, externalFilter}))

export const convertToUrlParams = (obj, delimiter) => {
    const params = new URLSearchParams();

    Object.keys(obj).forEach(column => {
        const values = obj[column];
        params.append(column, values.filter(v => Array.isArray(v) ? v.length : v).join(delimiter));
    });

    return params.toString();
};