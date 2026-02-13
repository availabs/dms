import React, {memo, useEffect, useRef, useState} from "react"

const ArrowDown = (props) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width={24} height={24} stroke="currentColor" fill={"none"} {...props}>
    <path d="M18 9.00005C18 9.00005 13.5811 15 12 15C10.4188 15 6 9 6 9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);
const CircleCheck = ({className='size-6', ...props}) => (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className} {...props}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
    </svg>
)
const theme = {
    multiselect: {
        view: 'w-full h-full',
        mainWrapper: 'w-full h-full relative',
        inputWrapper: 'flex px-2 py-1 w-full text-sm font-light border focus:border-blue-300 rounded-md bg-white hover:bg-blue-100 transition ease-in overflow-x-auto scrollbar-sm',
        input: 'w-full px-2 py-1 border rounded-lg focus:outline-none',
        statusWrapper: 'flex items-center p-0.5',
        tokenWrapper: 'w-fit flex m-0.5 px-2 py-1 mx-1 bg-[#C5D7E0] text-[#37576B] hover:bg-[#E0EBF0] rounded-md transition ease-in whitespace-nowrap',
        removeIcon: 'fa fa-xmark px-1 text-xs text-red-500 hover:text-red-600 self-center cursor-pointer transition ease-in',
        menuWrapper: 'absolute p-2 bg-white min-w-[100px] w-full max-h-[150px] overflow-auto scrollbar-sm shadow-lg z-10 rounded-lg',
        alwaysOpenMenuWrapper: 'p-2 bg-white min-w-[100px] w-full max-h-[300px] overflow-auto scrollbar-sm z-20 rounded-lg',
        tabularMenuWrapper: 'flex flex-row flex-wrap p-2 bg-white min-w-[100px] w-full overflow-auto scrollbar-sm z-20 rounded-lg',
        menuItem: 'flex gap-0.5 px-2 py-1 text-sm hover:bg-blue-300 hover:cursor-pointer transition ease-in rounded-md',
        smartMenuWrapper: 'w-full h-full flex flex-wrap',
        smartMenuItem: 'w-fit px-1 py-0.5 m-1 bg-blue-100 hover:bg-blue-300 hover:cursor-pointer transition ease-in border rounded-lg text-xs',
        error: 'p-1 text-xs text-red-700 font-bold',
        selectedValueIconName: 'CircleCheck',
        selectedValueIcon: 'size-4'
    },
}

const looselyEqual = (a, b) => {
    if (a == null && b == null) return true;

    if (typeof a === 'object' || typeof b === 'object') return false;

    return String(a) === String(b);
}

const RenderToken = ({token, value, onChange, theme, isSearching, setIsSearching, meta}) => {
    const label = meta?.[token.label || token] || token.label || token;
    const safeLabel = label && typeof label === 'object' ? JSON.stringify(label) : label
    return (
        <div className={theme?.multiselect?.tokenWrapper}>
            <div onClick={() => setIsSearching(!isSearching)}>{safeLabel}</div>
            {
                onChange && <div
                    className={theme?.multiselect?.removeIcon}
                    onClick={e => onChange(value.filter(v => (v.value ?? v) !== (token.value ?? token)).map(v => v?.value ?? v))}
                > </div>
            }
        </div>
    )
}

const RenderMenu = ({
    loading,
    options=[],
    meta,
    isSearching,
    setIsSearching,
    placeholder,
    setSearchKeyword,
    searchKeyword,
    value,
    onChange,
    singleSelectOnly,
    displayDetailedValues,
    keepMenuOpen,
    tabular,
    theme
}) => {
    const mappedValue = value.filter(v => v).map(v => v.value || v);
    const selectAllOption = {label: 'Select All', value: 'select-all'};
    const removeAllOption = {label: 'Remove All', value: 'remove-all'};
    return (
        <div className={`${isSearching || keepMenuOpen || tabular ? `block` : `hidden`} ${loading ? 'cursor-wait' : ''} ${tabular ? theme?.multiselect?.tabularMenuWrapper : keepMenuOpen ? theme?.multiselect?.alwaysOpenMenuWrapper : theme?.multiselect?.menuWrapper}`}>
            {
                tabular ? null :
                    <input
                        autoFocus
                        key={'input'}
                        placeholder={placeholder || 'search...'}
                        className={theme?.multiselect?.input}
                        onChange={e => setSearchKeyword(e.target.value)}
                        onFocus={() => setIsSearching(true)}
                    />
            }
            {
                tabular ? null :
                    <div className={theme?.multiselect?.smartMenuWrapper}>
                        {
                            [selectAllOption, removeAllOption]
                                .filter(o =>
                                    singleSelectOnly ? false :
                                        o.value === 'select-all' ? value.length !== options?.length :
                                            o.value === 'remove-all' ? value.length : true)
                                .map((o, i) =>
                                    <div
                                        key={`smart-option-${i}`}
                                        className={theme?.multiselect?.smartMenuItem}
                                        onClick={e => {
                                            onChange(
                                                o.value === 'select-all' ? (options || []).map(o => o?.value ?? o) :
                                                    o.value === 'remove-all' ? [] :
                                                        [...value, o].map(v => v?.value ?? v)
                                            );
                                            !keepMenuOpen && setIsSearching(false);
                                        }}>
                                        {o.label || o}
                                    </div>)
                        }
                    </div>
            }
            {
                (options || [])
                    .filter(o =>
                        (displayDetailedValues ? !mappedValue.includes(o.value || o) : true) && // if not showing selected values in bar, show them in options
                        (o.label || o)?.toString()?.toLowerCase().includes(searchKeyword?.toLowerCase()) // filter searched value
                    )
                    .map((o, i) => {
                        const isOptionSelected = mappedValue.includes(o.value || o);
                        return (
                            <div
                                key={`option-${i}`}
                                className={theme?.multiselect?.menuItem}
                                onClick={e => {
                                    // newValue should return .value if available instead of full options mapped obj
                                    const newValue =
                                        singleSelectOnly ? (o?.value ?? o) :
                                            isOptionSelected ? mappedValue.filter(v => (v?.value ?? v) !== (o?.value ?? o)) :
                                            [...value, o].map(o => o?.value ?? o)
                                    onChange(newValue);
                                    singleSelectOnly && !keepMenuOpen && setIsSearching(false);
                                }}>
                                {
                                    !displayDetailedValues && isOptionSelected ?
                                        <CircleCheck className={theme?.multiselect?.selectedValueIcon || 'size-4'} /> : null
                                }
                                {meta?.[o.label || o] ?? o.label ?? o}
                            </div>
                        )
                    })
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


const Edit = ({value = [], loading, onChange, className,placeholder, options = [], meta,
                  displayInvalidMsg=false,
                  menuPosition='bottom',
                  singleSelectOnly=false,
                  displayDetailedValues=true,
                  keepMenuOpen=false,
                  tabular=false
}) => {
    // options: ['1', 's', 't'] || [{label: '1', value: '1'}, {label: 's', value: '2'}, {label: 't', value: '3'}]
    const [searchKeyword, setSearchKeyword] = useState('');
    const typeSafeValue = (Array.isArray(value) ? value : [value]).map(v => (options || []).find(o => looselyEqual((o?.value || o), (v?.value || v))) || v);

    const {
        ref,
        isSearching,
        setIsSearching
    } = useComponentVisible(false);

    const invalidValues = typeSafeValue.filter(v => v && (v.value || v) && !(options || [])?.some(o => (o.value || o) === (v.value || v)));

    return (
        <div ref={ref} className={`${theme?.multiselect?.mainWrapper} ${menuPosition === 'top' ? 'flex flex-col-reverse' : ''} ${loading ? 'cursor-wait' : ''}`}>
            {
                invalidValues.length && displayInvalidMsg ? <div>Invalid Values: {JSON.stringify(invalidValues)}</div> : null
            }

            {
                tabular ? null :
                    <div className={(theme?.multiselect?.inputWrapper)} onClick={() => {
                        setIsSearching(!isSearching)
                        // console.log('ms?', ref.current.top)
                    }}>
                        {
                            displayDetailedValues ?
                                typeSafeValue
                                    .filter(d => d)
                                    .map((v, i) =>
                                        <RenderToken
                                            key={i}
                                            token={v}
                                            meta={meta}
                                            value={typeSafeValue}
                                            onChange={onChange}
                                            isSearching={isSearching}
                                            setIsSearching={setIsSearching}
                                            theme={theme}
                                        />) :
                                <div className={theme?.multiselect?.statusWrapper}>
                                    {typeSafeValue.length} selected
                                </div>
                        }
                        <ArrowDown className={`ml-auto self-center font-bold ${typeSafeValue?.length || !displayDetailedValues ? `-mt-4` : ``}`} width={16} height={16}/>
                    </div>
            }

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
                meta={meta}
                singleSelectOnly={singleSelectOnly}
                displayDetailedValues={displayDetailedValues}
                keepMenuOpen={keepMenuOpen}
                tabular={tabular}
                theme={theme}
            />
        </div>
    )
}

const View = memo(function View ({className, value, options = [], meta}){

    if (!value) return <div className={theme?.multiselect?.mainWrapper} />

    const mappedValue = (Array.isArray(value) ? value : [value]).map(v => (options || []).find(o => looselyEqual((o.value || o), (v.value || v))) || v);
    return (
        <div className={theme?.multiselect?.mainWrapper}>
            <div className={className || (theme?.text?.inputWrapper)}>
                {(mappedValue).map((i, ii) => <RenderToken key={ii} token={i} meta={meta} isSearching={false}
                                                           setIsSearching={() => {}} theme={theme}/>)}
            </div>
        </div>
    )
})

export default {
    "EditComp": Edit,
    "ViewComp": View
}