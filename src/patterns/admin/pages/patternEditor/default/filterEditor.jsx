import React, {useContext, useState} from "react";
import { AdminContext } from "../../../context";
import { ThemeContext } from "../../../../../ui/useTheme";
import { isEqual } from "lodash-es";
import { parseIfJSON } from "../../../../page/pages/_utils";

export const PatternFilterEditor = ({value=[], onChange, ...rest}) => {
    const {UI} = useContext(ThemeContext);
    const { apiUpdate} = useContext(AdminContext);
    const [tmpValue, setTmpValue] = useState(parseIfJSON(value));
    const [newFilter, setNewFilter] = useState({});
    const {FieldSet, Button} = UI;
    const customTheme = {
        field: 'pb-2 flex flex-col'
    }
    const customThemeButton = {
        field: 'pb-2 place-content-end'
    }

    const updateFilters = (idx, key, valueToUpdate) => {
        setTmpValue(value.map((v, i) => i === idx ? {...v, [key]: valueToUpdate} : v))
        onChange(value.map((v, i) => i === idx ? {...v, [key]: valueToUpdate} : v));
    }

    return (
        <div className={'flex flex-col gap-1 p-1 border rounded-md max-w-5xl'}>
            <label className={'text-sm'}>Filters</label>
            {
                (tmpValue?.filters || []).map((filter, i) => (
                    <FieldSet
                        className={'grid grid-cols-3 gap-1'}
                        components={[
                            {
                              label: 'Search Key',
                              type: 'Input',
                              placeholder: 'search key',
                              value: filter.searchKey,
                              onChange: e => updateFilters(i, 'searchKey', e.target.value),
                              customTheme
                            },
                            {label: 'Search Value', type: 'Input', placeholder: 'search value', value: filter.values,
                                onChange: e => updateFilters(i, 'values', e.target.value),
                                customTheme
                            },
                            {type: 'Button', children: 'remove', customTheme: customThemeButton,
                                onClick: () => {
                                    onChange(value.filter((_, idx) => i !== idx));
                                    setTmpValue(value.filter((_, idx) => i !== idx))
                                }
                            }
                        ]}
                    />
                ))
            }
            <FieldSet
                className={'grid grid-cols-3 gap-1'}
                components={[
                    {label: 'Search Key', type: 'Input', placeholder: 'search key', value: newFilter.searchKey,
                        onChange: e => setNewFilter({...newFilter, searchKey: e.target.value}),
                        customTheme
                    },
                    {label: 'Search Value', type: 'Input', placeholder: 'search value', value: newFilter.values,
                        onChange: e => setNewFilter({...newFilter, values: e.target.value}),
                        customTheme
                    },
                    {type: 'Button', children: 'add', customTheme: customThemeButton,
                        onClick: () => {
                            const id = uuidv4();
                            onChange([...value, {id, ...newFilter}]);
                            setTmpValue([...value, {id, ...newFilter}])
                            setNewFilter({});
                        }
                    }
                ]}
            />
            <Button onClick={() => {
                onChange([]);
                setTmpValue([])
                setNewFilter({});
            }} > clear all filters </Button>
            <FieldSet
                className={'grid grid-cols-12 gap-1 border rounded p-4'}
                components={[
                    {
                      type: 'Spacer',
                      customTheme: { field: 'bg-white col-span-10 ' }
                    },
                    {
                      type: 'Button',
                      children: <span>Reset</span>,
                      buttonType: 'plain',
                      disabled: isEqual(tmpValue,value),
                      value: tmpValue.base_url,
                      onClick: () => setTmpValue(draft => value),
                      customTheme: { field: 'pb-2 col-span-1 flex justify-end' }
                    },
                    {
                      type: 'Button',
                      children: <span>Save</span>,
                      disabled: isEqual(tmpValue,value),
                      onClick: () => apiUpdate({data:tmpValue}),
                      customTheme: { field: 'pb-2 col-span-1 flex justify-end' }
                    }
                ]}
            />
        </div>
    )
}
