import React, {useEffect, useState} from "react";
import { Typeahead, Menu, MenuItem, Input, useToken } from 'react-bootstrap-typeahead';
import { CMSContext } from '../../context'


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
        <div key={props.label} className="w-fit inline-block ml-2">
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
        <Menu className={'bg-blue-100 text-xs overflow-hidden z-[100] rounded-md'} {...menuProps}>
            {
                filters?.length ? <div className={'flex flex-row flex-wrap items-center justify-start gap-1 p-1 bg-blue-200 text-xs font-bold'}>
                    {
                        filters.map(({icon, label, value, filterText, onClick}) => {
                            const isActive = filter === filterText;
                            const onClickFn = e => onClick ? onClick(e) :
                                    value ? onChange(value) : setFilter(isActive ? null : filterText)
                            return (
                                <button
                                    key={filterText}
                                    title={`Filter by: ${filterText}`}
                                    className={
                                        `py-1 px-2 my-0.5 
                                    ${isActive ? `bg-blue-300 hover:bg-blue-300` : `bg-blue-100 hover:bg-blue-100`} 
                                     rounded-md`
                                    }
                                    onClick={e => onClickFn(e)}
                                >
                                    <i className={`${icon} pr-2 pl-1`}/>
                                    {label}
                                </button>
                            )
                        })
                    }
                </div> : null
            }
            {results.map((result, index) => (
                <MenuItem key={`${result.label}_${index}`} className={"block hover:bg-blue-200 text-xs tracking-wide p-1"} option={result}
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
    const { UI } = React.useContext(CMSContext) || {};
    const { Icon } = UI;
    const [selected, setSelected] = useState([]);
    const [filter, setFilter] = useState('');
    const [filteredOptions, setFilteredOptions] = useState(options);

    useEffect(() => {
        if (!value) {
            setSelected([])
        };
        const s = options.filter(h => h.key === value);
        setSelected(s)
    }, [value, options]);

    useEffect(() => {
        setFilteredOptions(
            options.filter(o => !filter || o?.label?.toLowerCase().includes(filter.toLowerCase()))
        )
    }, [options, filter])

    return (
        <div className={'flex justify-between text-xs'}>
            <div className={`flex flex-row ${className} w-full shrink my-1 px-1 py-0.5 rounded-l-md`}>
                <Icon className={"text-slate-400 w-[24px] h-[24px]"} icon={'Search'} />
                <i className={`fa fa-search font-light text-xl rounded-r-md`}/>
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
                    inputProps={{className: 'w-full flex flex-row flex-wrap px-1 py-0.5'}}
                    renderMenu={(results, menuProps, labelKey) =>
                        renderMenu({results, menuProps, labelKey, filters, filter, setFilter, onChange})}
                    renderToken={(props) => <RenderToken props={props} selected={selected} setSelected={setSelected} onChange={onChange}/>}
                />
            </div>
        </div>
    )
}