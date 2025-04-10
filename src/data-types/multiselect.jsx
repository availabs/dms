import React, {useEffect, useRef, useState} from "react"
import {useTheme} from '../theme'
import {Alert, ArrowDown} from "../patterns/admin/ui/icons";

const inputWrapper = 'flex px-2 py-1 w-full text-sm font-light border focus:border-blue-300 bg-white hover:bg-gray-100 transition ease-in';
const mainWrapper = 'w-full';
const input = 'focus:outline-none w-full';
const tokenWrapper = 'flex px-2 py-1 mx-1 bg-gray-100 hover:bg-gray-300 rounded-md transition ease-in';
const removeIcon = 'fa fa-x px-1 text-xs text-red-300 hover:text-red-500 self-center transition ease-in';
const menuWrapper = 'p-2 shadow-lg z-10';
const menuItem = 'px-2 py-1 hover:bg-gray-300 hover:cursor-pointer transition ease-in';

const RenderToken = ({token, value, onChange, theme, isSearching, setIsSearching}) => {
    return (
        <div className={theme?.multiselect?.tokenWrapper || tokenWrapper}>
            <div onClick={() => setIsSearching(!isSearching)}>{token.label || token}</div>
            {
                onChange && <i
                    className={theme?.multiselect?.removeIcon || removeIcon}
                    onClick={e => onChange(value.filter(v => (v.value || v) !== (token.value || token)))}
                > </i>
            }
        </div>
    )
}

const RenderMenu = ({
    loading,
    options=[],
    isSearching,
    setIsSearching,
    placeholder,
    setSearchKeyword,
    searchKeyword,
    value,
    onChange,
    singleSelectOnly,
    theme
}) => {
    const mappedValue = value.filter(v => v).map(v => v.value || v);
    const selectAllOption = {label: 'Select All', value: 'select-all'};
    const removeAllOption = {label: 'Remove All', value: 'remove-all'};
    return (
        <div className={`${isSearching ? `block` : `hidden`} ${theme?.multiselect?.menuWrapper || menuWrapper}`}>
            <input
                autoFocus
                key={'input'}
                placeholder={placeholder || 'search...'}
                className={theme?.multiselect?.input || input}
                onChange={e => setSearchKeyword(e.target.value)}
                onFocus={() => setIsSearching(true)}
            />
            <div className={theme.multiselect.smartMenuWrapper}>
                {
                    [selectAllOption, removeAllOption]
                        .filter(o =>
                            singleSelectOnly ? false :
                            o.value === 'select-all' ? value.length !== options?.length :
                                o.value === 'remove-all' ? value.length : true)
                        .map((o, i) =>
                            <div
                                key={`smart-option-${i}`}
                                className={theme?.multiselect?.smartMenuItem || menuItem}
                                onClick={e => {
                                    onChange(
                                        o.value === 'select-all' ? options :
                                            o.value === 'remove-all' ? [] :
                                                [...value, o]
                                    );
                                    setIsSearching(false);
                                }}>
                                {o.label || o}
                            </div>)
                }
            </div>
            { loading ? <div className={theme?.multiselect?.menuItem || menuItem}>loading...</div> :
                (options || [])
                    .filter(o => !mappedValue.includes(o.value || o) && (o.label || o)?.toString()?.toLowerCase().includes(searchKeyword?.toLowerCase()))
                    .map((o, i) =>
                        <div
                            key={`option-${i}`}
                            className={theme?.multiselect?.menuItem || menuItem}
                            onClick={e => {
                                onChange(
                                    o.value === 'select-all' ? options :
                                        o.value === 'remove-all' ? [] :
                                            singleSelectOnly ? [o] : [...value, o]
                                );
                                setIsSearching(false);
                            }}>
                            {o.label || o}
                        </div>)
            }
        </div>
    )
}

function useComponentVisible(initial) {
    const [isSearching, setIsSearching] = useState(initial);
    const ref = useRef(null);

    const handleHideDropdown = (event) => {
        if (event.key === "Escape" || event.key === "Tab") {
            setIsSearching(false);
        }
    };

    const handleClickOutside = event => {
        if (ref.current && !ref.current.contains(event.target)) {
            setIsSearching(false);
        }
    };

    useEffect(() => {
        document.addEventListener("keydown", handleHideDropdown, true);
        document.addEventListener("click", handleClickOutside, true);
        return () => {
            document.removeEventListener("keydown", handleHideDropdown, true);
            document.removeEventListener("click", handleClickOutside, true);
        };
    });

    return { ref, isSearching, setIsSearching };
}


const Edit = ({value = [], loading, onChange, className,placeholder, options = [], displayInvalidMsg=true, menuPosition='bottom', singleSelectOnly=false}) => {
    // options: ['1', 's', 't'] || [{label: '1', value: '1'}, {label: 's', value: '2'}, {label: 't', value: '3'}]
    const [searchKeyword, setSearchKeyword] = useState('');
    const typeSafeValue = Array.isArray(value) ? value : [value];
    const theme = useTheme();
    const {
        ref,
        isSearching,
        setIsSearching
    } = useComponentVisible(false);

    const invalidValues = typeSafeValue.filter(v => v && (v.value || v) && !options?.filter(o => (o.value || o) === (v.value || v))?.length);

    return (
        <div ref={ref} className={`${theme?.multiselect?.mainWrapper || mainWrapper} ${menuPosition === 'top' ? 'flex flex-col flex-col-reverse' : ''} ${loading ? 'cursor-wait' : ''}`}>
            {
                invalidValues.length && displayInvalidMsg ?
                    <Alert className={theme?.multiselect?.error} title={`Invalid Values: ${JSON.stringify(invalidValues)}`} /> : null
            }
            <div className={className || (theme?.multiselect?.inputWrapper) || inputWrapper} onClick={() => {
                setIsSearching(!isSearching)
                // console.log('ms?', ref.current.top)
            }}>
                {
                    typeSafeValue
                        .filter(d => d)
                        .map((v, i) =>
                            <RenderToken
                                key={i}
                                token={v}
                                value={typeSafeValue}
                                onChange={onChange}
                                isSearching={isSearching}
                                setIsSearching={setIsSearching}
                                theme={theme}
                            />)
                }
                <ArrowDown className={'ml-auto self-center font-bold'} width={16} height={16}/>
            </div>

            <RenderMenu
                loading={loading}
                isSearching={isSearching}
                setIsSearching={setIsSearching}
                placeholder={placeholder}
                setSearchKeyword={setSearchKeyword}
                searchKeyword={searchKeyword}
                value={typeSafeValue}
                onChange={onChange}
                options={options}
                singleSelectOnly={singleSelectOnly}
                theme={theme}
            />
        </div>
    )
}

const View = ({className, value, options = []}) => {
    const theme = useTheme();
    if (!value) return <div className={theme?.multiselect?.mainWrapper} />

    const mappedValue = (Array.isArray(value) ? value : [value]).map(v => v.value || v)

    return (
        <div className={theme?.multiselect?.mainWrapper}>
            <div className={className || (theme?.text?.inputWrapper)}>
                {(mappedValue).map((i, ii) => <RenderToken key={ii} token={i} isSearching={false}
                                                           setIsSearching={() => {
                                                           }} theme={theme}/>)}
            </div>
        </div>
    )
}

export default {
    "EditComp": Edit,
    "ViewComp": View
}