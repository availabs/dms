import React, {useEffect} from "react";
import {DatasetsContext} from "../../../context";
import {isEqual} from "lodash-es";
const customTheme = {
    field: 'pb-2 flex flex-col'
}
const DataSourceForm = ({editing, updateAttribute, col, attr, type}) => {
    const {UI, app} = React.useContext(DatasetsContext);
    const [metaObj, setMetaObj] = React.useState(editing);

    useEffect(() => {
        if(!isEqual(editing, metaObj)) setMetaObj(editing)
    }, [editing]);

    const {FieldSet} = UI;
    return type === 'datasource' ? (
        <FieldSet
            className={'grid grid-cols-4 gap-1'}
            components={[
                {
                    label: 'view ID', type: 'Input', placeholder: 'view id', value: metaObj.view_id,
                    onChange: e => setMetaObj({...metaObj, view_id: e.target.value}),
                    customTheme
                },
                {
                    label: 'Key Column', type: 'Input', placeholder: 'key column', value: metaObj.keyAttribute,
                    onChange: e => setMetaObj({...metaObj, keyAttribute: e.target.value}),
                    customTheme
                },
                {
                    label: 'Value Column', type: 'Input', placeholder: 'value column', value: metaObj.valueAttribute,
                    onChange: e => setMetaObj({...metaObj, valueAttribute: e.target.value}),
                    customTheme
                },
                {
                    label: 'Type',
                    type: 'Input',
                    placeholder: 'type',
                    value: (metaObj.metaEnv || '').split('+')[1] || '',
                    onChange: e => setMetaObj({...metaObj, metaEnv: `${app}+${e.target.value}`}),
                    customTheme
                },
                {
                    label: 'Filter',
                    type: 'Input',
                    placeholder: '{"year": [2020], "length(geoid)": [5]}',
                    value: typeof metaObj.filter === 'object' && metaObj.filter ? JSON.stringify(metaObj.filter) : metaObj.filter,
                    onChange: e => setMetaObj({...metaObj, filter: e.target.value}),
                    customTheme
                },
                {
                    label: 'Persist ID', type: 'Switch', enabled: metaObj.keepId, size: 'small',
                    setEnabled: e => setMetaObj({...metaObj, 'keepId': e}),
                    className: 'self-center',
                    customTheme
                },
                {
                    label: 'Is Numeric',
                    type: 'Switch',
                    enabled: metaObj.formatValuesToMap === 'parseInt',
                    size: 'small',
                    setEnabled: e => setMetaObj({...metaObj, formatValuesToMap: e ? 'parseInt' : 'none'}),
                    className: 'self-center',
                    customTheme
                },
                {
                    type: 'Button', children: 'save',
                    onClick: () => {
                        updateAttribute(col, {[attr]: JSON.stringify(metaObj)});
                    }
                }
            ]}
        />
    ) : null;
}

const CustomEntryForm = ({editing, updateAttribute, col, attr, type}) => {
    const {UI} = React.useContext(DatasetsContext);
    const {FieldSet, Button} = UI;
    const [metaObj, setMetaObj] = React.useState(Object.keys(editing).map(k => ({key: k, value: editing[k]})));
    const [newPair, setNewPair] = React.useState({});

    useEffect(() => {
        const transformedValue = Object.keys(editing).map(k => ({key: k, value: editing[k]}));
        if(!isEqual(transformedValue, metaObj)) setMetaObj(transformedValue)
    }, [editing]);
    if(type !== 'custom') return null;
    return (
        <>
            {metaObj.map((pair, i) => (
                <FieldSet
                    className={'grid grid-cols-1 sm:grid-cols-2 md:grid-cols-6 gap-1'}
                    components={[
                        {
                            type: 'Input', placeHolder: 'key', value: pair.key,
                            onChange: e => setMetaObj(metaObj.map((m, mi) => mi === i ? {
                                key: e.target.value,
                                value: pair.value
                            } : m)),
                            customTheme
                        },
                        {
                            type: 'Input', placeHolder: 'value', value: pair.value,
                            onChange: e => setMetaObj(metaObj.map((m, mi) => mi === i ? {
                                key: pair.key,
                                value: e.target.value
                            } : m)),
                            customTheme
                        },
                        {
                            type: 'Button', children: 'update',
                            onClick: () => {
                                const finalObj = metaObj.reduce((acc, curr) => ({...acc, [curr.key]: curr.value}) , {})
                                updateAttribute(col, {[attr]: JSON.stringify(finalObj)});
                            }
                        },
                        {
                            type: 'Button', children: 'remove',
                            onClick: () => {
                                const finalObj = metaObj.filter((_, mi) => mi !== i).reduce((acc, curr) => ({...acc, [curr.key]: curr.value}) , {})
                                updateAttribute(col, {[attr]: JSON.stringify(finalObj)});
                            }
                        }
                    ]}
                />
            ))}
            <FieldSet
                className={'grid grid-cols-1 sm:grid-cols-2 md:grid-cols-6 gap-1'}
                components={[
                    {
                        type: 'Input', placeHolder: 'key', value: newPair.key,
                        onChange: e => setNewPair({...newPair, key: e.target.value}),
                        customTheme
                    },
                    {
                        type: 'Input', placeHolder: 'value', value: newPair.value,
                        onChange: e => setNewPair({...newPair, value: e.target.value}),
                        customTheme
                    },
                    {
                        type: 'Button', children: 'add',
                        onClick: () => {
                            const finalObj = {...editing, [newPair.key]: newPair.value};
                            updateAttribute(col, {[attr]: JSON.stringify(finalObj)});
                            setNewPair({});
                        }
                    }
                ]}
            />
        </>
    );
}

const parseIfJSON = strValue => {
    if(typeof strValue === 'object') return strValue;
    try {
        return JSON.parse(strValue);
    }catch (e){
        return {}
    }
}
export const Metadata = ({value={}, col, drivingAttribute, attr, updateAttribute}) => {
    const [editing, setEditing] = React.useState(parseIfJSON(value));
    const [type, setType] = React.useState(editing?.view_id ? 'datasource' : 'custom');
    const {UI} = React.useContext(DatasetsContext);
    const {Tabs, Button} = UI;

    useEffect(() => {
        if(!isEqual(value, editing)) setEditing(parseIfJSON(value))
    }, [value])
    if(drivingAttribute !== 'meta') return null;
    return (
        <div>
            <div className={'flex justify-between'}>
                <label>metadata</label>
                <Button onClick={() => updateAttribute(col, {[attr]: undefined})}>clear metadata</Button>
            </div>
            <Tabs
                selectedIndex={type === 'datasource' ? 0 : 1}
                setSelectedIndex={i => setType(i === 0 ? 'datasource' : 'custom')}
                tabs={[
                    {name: 'Datasource', Component: () => <DataSourceForm type={type} attr={attr} col={col} editing={editing} setEditing={setEditing} updateAttribute={updateAttribute} />},
                    {name: 'Custom', Component: () => <CustomEntryForm type={type} attr={attr} col={col} editing={editing} setEditing={setEditing} updateAttribute={updateAttribute} />},
                ]}
            />
        </div>

    )
}