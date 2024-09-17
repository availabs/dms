import React, {useEffect, useState} from "react";

const TemplateEdit = ({
    item,
                          Component,
                          attributes={},
                          updateAttribute,
                          status,
                          submit,
                          onChange,
                          value = [],
                          format,
                        ...rest
}) => {
    // const {id} = params;
    const [newItem, setNewItem] = useState({});
    const [editingIndex, setEditingIndex] = useState(undefined);
    const [editingItem, setEditingItem] = useState(undefined);
    const attrToShow = Object.keys(attributes).filter(attrKey => !['sections'].includes(attrKey));
    const numAttributes = attrToShow.length;

    const addNewValue = () => {
        const newData = [...value, newItem];
        onChange(newData)
        submit(newData)
        setNewItem({})
    }
    const c = {
        1: 'grid grid-cols-1',
        2: 'grid grid-cols-2',
        3: 'grid grid-cols-3',
        4: 'grid grid-cols-4',
        5: 'grid grid-cols-5',
        6: 'grid grid-cols-6',
        7: 'grid grid-cols-7',
        8: 'grid grid-cols-8',
        9: 'grid grid-cols-9',
        10: 'grid grid-cols-10',
        11: 'grid grid-cols-11',
    };
    return <div key={item?.id} className={'w-full'}>
        {status ? <div>{JSON.stringify(status)}</div> : ''}

        <div className={`font-semibold ${c[numAttributes + 1]}`}>
            {
                attrToShow.map(attr => <div>{attr}</div>)
            }
            <div>Actions</div>
        </div>

        {
            value.map((pattern, index) => (
                <div key={pattern.id} className={c[numAttributes+1]}>
                    {
                        attrToShow
                            .filter(attrKey => attrKey !== 'config')
                            .map(attr => {
                                    let EditComp = attributes[attr].EditComp;


                                    return editingIndex === index ?
                                        <EditComp
                                            key={`${attr}-${index}`}
                                            value={editingItem?.[attr]}
                                            onChange={(v) => setEditingItem({...editingItem, [attr]: v})}
                                            {...attributes[attr]}
                                        />
                                        : <div>{typeof pattern[attr] === 'object' ? 'Invalid state' : pattern[attr]}</div>
                                }
                            )
                    }
                    <div className={'w-full flex items-center justify-start'}>
                        <button
                            className={'bg-blue-100 hover:bg-blue-300 text-blue-800 px-2 py-0.5 m-1 rounded-lg w-fit h-fit'}
                            title={'edit item'}
                            onClick={() => {
                                setEditingIndex(editingIndex === index ? undefined : index);
                                setEditingItem(editingIndex === index ? undefined : pattern)
                            }}
                        >{editingIndex === index ? 'cancel' : 'edit'}
                        </button>
                        {
                            editingIndex === index &&
                            <button
                                className={'bg-blue-100 hover:bg-blue-300 text-blue-800 px-2 py-0.5 m-1 rounded-lg w-fit h-fit'}
                                title={'done editing'}
                                onClick={() => {
                                    value.splice(index, 1, editingItem);
                                    onChange(value)
                                    setEditingIndex(editingIndex === index ? undefined : index);
                                    setEditingItem(editingIndex === index ? undefined : pattern)
                                    submit(value)
                                }}
                            >done
                            </button>
                        }
                        <button
                            className={'bg-red-100 hover:bg-red-300 text-red-800 px-2 py-0.5 mx-1 rounded-lg w-fit h-fit'}
                            title={'remove item'}
                            onClick={() => {
                                const newData = value.filter((v, i) => i !== index);
                                onChange(newData)
                                submit(newData)
                            }}
                        > remove
                        </button>
                    </div>
                </div>
            ))
        }

        <div className={`${c[numAttributes+1]}`}>
            {
                attrToShow
                    .map((attrKey, i) => {
                        let EditComp = attributes[attrKey].EditComp;

                        return (
                            <div key={`${attrKey}-${i}`} className={'w-full font-semibold'}>
                                    <EditComp
                                        key={`${attrKey}-${i}`}
                                        value={newItem?.[attrKey]}
                                        onChange={(v) => setNewItem({...newItem, [attrKey]: v})}
                                        {...attributes[attrKey]}
                                    />
                            </div>
                        )
                    })
            }
            <button className={'bg-blue-100 hover:bg-blue-300 text-blue-800 px-2 py-0.5 m-1 rounded-lg w-fit h-fit'} onClick={addNewValue}>add
            </button>
        </div>
    </div>
}

const TemplateView = ({
                          status,
                          attributes,
                          dataItems,
                                format,
                                item,
                                user,
                                params,
                                submit,
                                ...rest
}) => {
    // const {id} = params;

    return <div key={item.id} className={'w-full'}>
        {Object.keys(attributes)
            .map((attrKey, i) => {
                let ViewComp = attributes[attrKey].ViewComp;
                return (
                    <div key={`${attrKey}-${i}`}>
                        <ViewComp
                            key={`${attrKey}-${i}`}
                            value={item?.[attrKey]}
                            format={format}
                            {...attributes[attrKey]}
                        />
                    </div>
                )
            })
        }
    </div>
}

export default {
    "EditComp": TemplateEdit,
    "ViewComp": TemplateView
}