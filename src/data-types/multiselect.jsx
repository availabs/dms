import React, {useEffect, useRef, useState} from "react"
import {useTheme} from '../theme'

const inputWrapper = 'flex px-2 py-1 w-full text-sm font-light border focus:border-blue-300 bg-white hover:bg-gray-100 transition ease-in';
const input = 'focus:outline-none w-full';
const tokenWrapper = 'flex px-2 py-1 mx-1 bg-gray-100 hover:bg-gray-300 rounded-md transition ease-in';
const removeIcon = 'fa fa-x px-1 text-xs text-red-300 hover:text-red-500 self-center transition ease-in';
const menuWrapper = 'p-2 shadow-lg z-10';
const menuItem = 'px-2 py-1 hover:bg-gray-300 hover:cursor-pointer transition ease-in';

const RenderToken = ({token, value, onChange, theme}) => {
    return (
        <div className={theme?.multiselect?.tokenWrapper || tokenWrapper}>
            <div >{token.label || token}</div>
            <i
                className={theme?.multiselect?.removeIcon || removeIcon}
                onClick={e => onChange(value.filter(v => (v.value || v) !== (token.value || token)))}
            />
        </div>
    )
}

const RenderMenu = ({options, isSearching, setIsSearching, searchKeyword, value, onChange, theme}) => {
    const mappedValue = value.map(v => v.value || v)
    return (
        <div className={`${isSearching ? `block` : `hidden`} ${theme?.multiselect?.menuWrapper || menuWrapper}`}>
            {
                options
                    .filter(o => !mappedValue.includes(o.value || o) && (o.label || o).includes(searchKeyword))
                    .map((o, i) =>
                        <div
                            key={`option-${i}`}
                            className={theme?.multiselect?.menuItem || menuItem}
                            onClick={e => {
                                onChange([...value, o]);
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


const Edit = ({value = [], onChange, className,placeholder, options = []}) => {
    // options: ['1', 's', 't'] || [{label: '1', value: '1'}, {label: 's', value: '2'}, {label: 't', value: '3'}]
    const [searchKeyword, setSearchKeyword] = useState('');
    const typeSafeValue = Array.isArray(value) ? value : [value];
    const theme = useTheme();
    const {
        ref,
        isSearching,
        setIsSearching
    } = useComponentVisible(false);

    const invalidValues = typeSafeValue.filter(v => (v.value || v) && !options.filter(o => (o.value || o) === (v.value || v))?.length);

    return (
        <div ref={ref}>
            {
                invalidValues.length ? <div className={theme?.multiselect?.error}>Invalid Values: {JSON.stringify(invalidValues)}</div> : null
            }
            <div className={className || (theme?.multiselect?.inputWrapper) || inputWrapper}>
                {
                    typeSafeValue
                        .map((v, i) =>
                            <RenderToken
                                key={i}
                                token={v}
                                value={typeSafeValue}
                                onChange={onChange}
                                theme={theme}
                            />)
                }
                <input
                    key={'input'}
                    placeholder={placeholder}
                    className={theme?.multiselect?.input || input}
                    onChange={e => setSearchKeyword(e.target.value)}
                    onFocus={() => setIsSearching(true)}
                />
            </div>

            <RenderMenu
                isSearching={isSearching}
                setIsSearching={setIsSearching}
                searchKeyword={searchKeyword}
                value={typeSafeValue}
                onChange={onChange}
                options={options}
                theme={theme}
            />
        </div>
    )
}

const View = ({className, value, options = []}) => {
    if (!value) return false
    const theme = useTheme();
    const mappedValue = (Array.isArray(value) ? value : [value]).map(v => v.value || v)
    const option =
        options
            .filter(o => mappedValue.includes(o.value || o))
            .map(o => o.label || o).join(', ');

    return (
        <div className={className || (theme?.text?.view)}>
            {option || JSON.stringify(mappedValue)}
        </div>
    )
}

export default {
    "EditComp": Edit,
    "ViewComp": View
}