import {getAccessor, getColAccessor} from "./getColAccesor";
import {getNestedValue} from "./getNestedValue";

const filterData = ({geoAttribute, geoid, data, actionType}) =>
    data.filter(d => {
            return !geoAttribute ||
                actionType === 'shmp' ||
                d[geoAttribute] == geoid ||
                (geoid?.toString()?.length === 2 && d[geoAttribute]?.substring(0, 2) == geoid) // todo: geofilters should move to data call
        }
    );

const handleExpandableRows = (data, attributes, openOutCols, columns) => {
    const openOutAttributes =
        attributes
            .filter(attr => openOutCols?.includes(attr.name))
            .map(attr => attr.name);
    const expandableColumns = columns.filter(c => openOutAttributes.includes(c.name))
    if (expandableColumns?.length) {
        const newData = data.map(row => {
            const newRow = {...row}
            newRow.expand = []
            newRow.expand.push(
                ...expandableColumns.map(col => {
                    const value = getNestedValue(row[col.accessor]);

                    return {
                        key: attributes.find(attr => attr.name === col.name)?.display_name || col.name,
                        accessor: col.accessor,
                        value: Array.isArray(value) ? value.join(', ') : typeof value === 'object' ? '' : value, // to display arrays
                        originalValue: Array.isArray(value) ? value : typeof value === 'object' ? '' : value // to filter arrays
                    }
                })
            )
            expandableColumns.forEach(col => delete newRow[col.accessor])
            return newRow;
        });
        return newData;
    } else {
        return data
    }
}

export async function setMeta({
                                  formsConfig,
                                  visibleCols,
                                  openOutCols,
                                  data,
                                  metaLookupByViewId,
                                  geoAttribute, geoid,
                                  actionType,
                                  fn, form
                              }) {

    const metaLookupCols = formsConfig.attributes?.filter(md =>  visibleCols.includes(md.name) && md.meta_lookup);
    if (metaLookupCols?.length) {
        const dataWithMeta = filterData({
            geoAttribute: getColAccessor(fn, geoAttribute, formsConfig.attributes?.find(attr => attr.name === geoAttribute)?.origin, form),
            geoid,
            data,
            actionType
        })
            .map(row => {
                metaLookupCols.forEach(mdC => {
                    const currentMetaLookup = typeof mdC.meta_lookup === 'string' ? JSON.parse(mdC.meta_lookup) : mdC.meta_lookup;
                    const modifiedName = fn[mdC.name] && fn[mdC.name].includes('data->') ? fn[mdC.name] :
                        fn[mdC.name] && !fn[mdC.name].includes('data->') && fn[mdC.name].toLowerCase().includes(' as ') ?
                            fn[mdC.name].replace(mdC.name, `${getAccessor(mdC.name, form)}'${mdC.name}'`) :
                            fn[mdC.name] && !fn[mdC.name].includes('data->') && !fn[mdC.name].toLowerCase().includes(' as ') ?
                                `${fn[mdC.name].replace(mdC.name, `${getAccessor(mdC.name, form)}'${mdC.name}'`)} as ${mdC.name}` :
                                `${getAccessor(mdC.name, form)}'${mdC.name}' as ${mdC.name}`;


                    if (currentMetaLookup?.view_id) {
                        const {valueAttribute = 'name'} = currentMetaLookup;
                        const currentViewIdLookup = metaLookupByViewId?.[mdC.name] || [];
                        const currentRawValue = row[modifiedName];
                        if (currentRawValue?.includes(',')) {
                            row[modifiedName] = currentRawValue.split(',')
                                .reduce((acc, curr) =>
                                        [...acc,
                                            currentViewIdLookup?.[curr?.trim()]?.[valueAttribute] || curr]
                                    , [])//.join(', ')
                        } else {
                            row[modifiedName] = currentViewIdLookup?.[row[modifiedName]]?.[valueAttribute] || row[modifiedName];
                        }
                    } else {
                        row[modifiedName] = currentMetaLookup?.[row[modifiedName]] || row[modifiedName];
                    }
                })
                return row;
            })
        return handleExpandableRows(
            dataWithMeta,
            formsConfig.attributes,
            openOutCols,
            visibleCols.map(vc => ({
                name: vc,
                accessor: getColAccessor(fn, vc, formsConfig.attributes?.find(attr => attr.name === vc)?.origin, form)
            }))
        )
    } else {
        return handleExpandableRows(
            filterData({
                geoAttribute: getColAccessor(fn, geoAttribute, formsConfig.attributes?.find(attr => attr.name === geoAttribute)?.origin, form),
                geoid,
                data,
                actionType
            }),
            formsConfig.attributes,
            openOutCols,
            visibleCols.map(vc => ({
                name: vc,
                accessor: getColAccessor(fn, vc, formsConfig.attributes?.find(attr => attr.name === vc)?.origin, form)
            }))
        )
    }
}