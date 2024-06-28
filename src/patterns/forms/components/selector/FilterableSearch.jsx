import {Typeahead, Menu, MenuItem, Input, useToken} from 'react-bootstrap-typeahead';
import get from "lodash/get";
import React, {useEffect, useState} from "react";
import placeholder from "lodash/fp/placeholder.js";

const handleSearch = (text, selected, setSelected) => {
    if (selected) setSelected([])
}

const onChangeFilter = (selected, setSelected, onChange) => {
    let value = selected[0]?.key;
    setSelected(selected);
    onChange && onChange(value);
}

const RenderToken = ({props, selected, setSelected, onChange}) => {
    return (
        <div className="w-fit inline-block ml-2">
            {props.label}
            <button
                className={'hover:text-red-300 animate ml-1 p-1 rounded-md rbt-token-remove-button'}
                onClick={e => {
                    const v = selected.filter(s => s.key !== props.key);
                    onChangeFilter(v, setSelected, onChange)
                }}
            >
                <i className={'fa fa-close'} />
            </button>
        </div>
    );
}
const renderMenu = ({results, menuProps, labelKey, filter, filters, setFilter, onChange, ...rest}) => {
    return (
        <Menu className={'bg-slate-100 overflow-hidden z-10 rounded-md'} {...menuProps}>
            {
                <div className={'flex flex-row flex-wrap items-center justify-start gap-1 p-1 bg-slate-200 text-xs font-bold'}>
                    {
                        filters.map(({icon, label, value, filterText}) => {
                            const isActive = filter === filterText;
                            const onClick = e =>
                                value ? onChange(value) : setFilter(isActive ? null : filterText)
                            return (
                                <button
                                    key={filterText}
                                    title={`Filter by: ${filterText}`}
                                    className={
                                        `py-1 px-2 my-0.5 
                                    ${isActive ? `bg-slate-300 hover:bg-blue-300` : `bg-slate-100 hover:bg-blue-100`} 
                                     rounded-md`
                                    }
                                    onClick={onClick}
                                >
                                    <i className={`${icon} pr-2 pl-1`}/>
                                    {label}
                                </button>
                            )
                        })
                    }
                </div>
            }
            {results.map((result, index) => (
                <MenuItem className={"block hover:bg-slate-200 text-xl tracking-wide pl-1"} option={result}
                          position={index}>
                    {result.label}
                </MenuItem>
            ))}
        </Menu>
    )
};

export default ({
                    className,
                    value,
                    onChange,
                    options = [],
                    filters = [],
                    showAll = false,
                    placeholder = "Search..."
                }) => {
    const [selected, setSelected] = useState([]);
    const [filter, setFilter] = useState('');
    const [filteredOptions, setFilteredOptions] = useState(options);

    useEffect(() => {
        if (!value) return;
        const s = options.filter(h => h.key === value);
        setSelected(s)
    }, [value]);

    useEffect(() => {
        setFilteredOptions(
            options.filter(o => !filter || o?.label?.toLowerCase().includes(filter.toLowerCase()))
        )
    }, [options, filter])

    return (
        <div className={'flex justify-between'}>
            <div className={`flex flex row ${className} w-full shrink my-1 bg-white p-1 pl-3 rounded-l-md`}>
                <i className={`fa fa-search font-light text-xl bg-white rounded-r-md`}/>
                <Typeahead
                    className={'w-full'}
                    // multiple={true}
                    onSearch={handleSearch}
                    minLength={0}
                    id="search"
                    key="search"
                    placeholder={placeholder}
                    options={filteredOptions}
                    labelKey={(option) => `${option?.label}`}
                    defaultSelected={selected}
                    onChange={(selected) => onChangeFilter(selected, setSelected, onChange, options)}
                    selected={selected}
                    inputProps={{className: 'w-full flex flex-row flex-wrap p-2'}}
                    renderMenu={(results, menuProps, labelKey) =>
                        renderMenu({results, menuProps, labelKey, filters, filter, setFilter, onChange})}
                    renderToken={(props) => <RenderToken props={props} selected={selected} setSelected={setSelected} onChange={onChange}/>}
                />
            </div>
        </div>
    )
}