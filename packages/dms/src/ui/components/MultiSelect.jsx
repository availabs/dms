import React, {memo, useCallback, useContext, useEffect, useLayoutEffect, useRef, useState} from "react"
import { createPortal } from "react-dom"
import { ThemeContext, getComponentTheme } from "../useTheme"
import { multiselectTheme } from "./MultiSelect.theme"


const looselyEqual = (a, b) => {
    if (a == null && b == null) return true;

    if (typeof a === 'object' || typeof b === 'object') return false;

    return String(a) === String(b);
}

const RenderToken = ({token={}, value, onChange, t, isSearching, setIsSearching, meta}) => {
    const { UI } = useContext(ThemeContext) || {};
    const { Icon } = UI || {};
    const label = meta?.[token?.label || token] || token?.label || token;
    const safeLabel = label && typeof label === 'object' ? JSON.stringify(label) : label
    return (
        <div className={t.tokenWrapper}>
            <div onClick={() => setIsSearching(!isSearching)}>{safeLabel}</div>
            {
                onChange && <div
                    className={t.removeIcon}
                    onClick={e => onChange(value.filter(v => (v.value ?? v) !== (token.value ?? token)).map(v => v?.value ?? v))}
                >
                    <Icon icon={t.removeIconName || 'XMark'} className={t.removeIconClass} />
                </div>
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
    searchable,
    keepMenuOpen,
    tabular,
    menuStyle,
    menuRef,
    t
}) => {
    const { UI } = useContext(ThemeContext) || {};
    const { Icon } = UI || {};
    const mappedValue = value.filter(v => v).map(v => v.value || v);
    const selectAllOption = {label: 'Select All', value: 'select-all'};
    const removeAllOption = {label: 'Remove All', value: 'remove-all'};
    return (
        <div
            ref={menuRef}
            className={`${isSearching || keepMenuOpen || tabular ? `block` : `hidden`} ${loading ? 'cursor-wait' : ''} ${tabular ? t.tabularMenuWrapper : keepMenuOpen ? t.alwaysOpenMenuWrapper : t.menuWrapper}`}
            style={menuStyle}
        >
            {
                tabular || !searchable ? null :
                    <input
                        autoFocus
                        key={'input'}
                        placeholder={placeholder || 'search...'}
                        className={`${t.input} ${loading ? 'cursor-wait' : ''}`}
                        onChange={e => setSearchKeyword(e.target.value)}
                        onFocus={() => setIsSearching(true)}
                    />
            }
            <div className={t.optionsWrapper}>
                {
                    tabular ? null :
                    <div className={t.smartMenuWrapper}>
                        {
                            [selectAllOption, removeAllOption]
                                .filter(o =>
                                    singleSelectOnly ? false :
                                        o.value === 'select-all' ? value.length !== options?.length :
                                            o.value === 'remove-all' ? value.length : true)
                                .map((o, i) =>
                                    <div
                                        key={`smart-option-${i}`}
                                        className={t.smartMenuItem}
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
                            .filter(o => {
                                // if not showing selected values in bar, show them in options
                                if (displayDetailedValues && mappedValue.includes(o.value || o)) return false;
                                if (!searchKeyword) return true;
                                const kw = searchKeyword.toLowerCase();
                                const rawLabel = o.label ?? o;
                                // React-element labels (e.g. icon + name) can't be stringified
                                // for search; fall back to the option's `value` in that case.
                                const labelStr = React.isValidElement(rawLabel) ? '' : String(rawLabel).toLowerCase();
                                const valueStr = (o?.value ?? '').toString().toLowerCase();
                                return labelStr.includes(kw) || valueStr.includes(kw);
                            })
                            .map((o, i) => {
                                const isOptionSelected = mappedValue.includes(o.value || o);
                                return (
                                    <div
                                        key={`option-${i}`}
                                        className={t.menuItem}
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
                                                <Icon icon={t.selectedValueIconName || 'CircleCheck'} className={t.selectedValueIcon} /> : null
                                        }
                                        {meta?.[o.label || o] ?? o.label ?? o}
                                    </div>
                                )
                            })
                    }
                    {loading && (
                        <div className="flex items-center justify-center gap-1 py-1 text-xs text-zinc-400 dark:text-zinc-500">
                            <div className="size-3 border-2 border-zinc-300 border-t-blue-500 rounded-full animate-spin" />
                            loading...
                        </div>
                    )}
            </div>
        </div>
    )
}

// Manages open/closed state + Escape/Tab + click-outside for the dropdown.
// `extraRefs` lets callers exclude additional DOM subtrees from the
// click-outside check (e.g. a menu portaled to document.body which is no
// longer a DOM descendant of the wrapper ref).
function useComponentVisible(initial, extraRefs = []) {
    const [isSearching, setIsSearching] = useState(initial);
    const ref = useRef(null);

    const handleHideDropdown = (event) => {
        if (event.key === "Escape" || event.key === "Tab") {
            setIsSearching(false);
        }
    };

    const handleClickOutside = event => {
        if (ref.current && ref.current.contains(event.target)) return;
        for (const r of extraRefs) {
            if (r?.current && r.current.contains(event.target)) return;
        }
        setIsSearching(false);
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


/**
 * MultiSelect — the canonical multi/single-select primitive.
 *
 * Props:
 *   value: array of selected values (or a single value when singleSelectOnly)
 *   onChange: (newValue) => void
 *   options: Array<string | {label, value}>
 *   meta: optional label→display-label map applied at render time
 *   placeholder: search-input placeholder
 *   loading: bool — shows a spinner inside the menu while options are loading
 *   onSearch: optional debounced (300ms) callback fired with the search keyword
 *   displayInvalidMsg: bool — show a list of values that don't match any option
 *   menuPosition: 'bottom' (default) | 'top'
 *
 *   --- variants ---
 *   singleSelectOnly: bool — only one value at a time. The trigger renders the
 *     selected label as inline text (no pill chip, no remove button); the
 *     placeholder shows when nothing is selected.
 *   searchable: bool (default true) — render the search input inside the menu
 *   display: 'compact' (default) | 'expanded' | 'tabular'
 *      compact:  collapsed trigger with selected chips; menu opens on click
 *      expanded: menu is always visible below the trigger (no toggle)
 *      tabular:  options laid out as a flat row of pills; no trigger, no menu chrome
 *   displayDetailedValues: bool (default true) — show selected chips in the
 *     trigger; when false, show "N selected" status instead and surface a
 *     CircleCheck on selected option rows
 *
 *   --- legacy (kept for back-compat with existing callers) ---
 *   keepMenuOpen: equivalent to display='expanded'
 *   tabular: equivalent to display='tabular'
 *
 *   activeStyle: optional named style or index — picks which `styles[]` entry
 *     in `theme.multiselect` to apply (defaults to options.activeStyle).
 */
export const MultiSelectEdit = ({value = [], loading, onChange, className, placeholder, options = [], meta,
                  displayInvalidMsg=false,
                  menuPosition='bottom',
                  singleSelectOnly=false,
                  displayDetailedValues=true,
                  searchable=true,
                  display,
                  keepMenuOpen=false,
                  tabular=false,
                  onSearch,
                  activeStyle
}) => {
    const { theme: themeFromContext = {}, UI } = useContext(ThemeContext) || {};
    const { Icon } = UI || {};
    const t = { ...multiselectTheme.styles[0], ...getComponentTheme(themeFromContext, 'multiselect', activeStyle) };
    // Resolve the display mode: explicit `display` prop wins over the legacy
    // keepMenuOpen / tabular flag pair. After this point, only `isExpanded`
    // and `isTabular` are used so the rest of the component reads cleanly.
    const effectiveDisplay = display ?? (tabular ? 'tabular' : keepMenuOpen ? 'expanded' : 'compact');
    const isExpanded = effectiveDisplay === 'expanded';
    const isTabular = effectiveDisplay === 'tabular';
    // options: ['1', 's', 't'] || [{label: '1', value: '1'}, {label: 's', value: '2'}, {label: 't', value: '3'}]
    const [searchKeyword, setSearchKeyword] = useState('');
    const [menuStyle, setMenuStyle] = useState(null);
    const searchTimerRef = useRef(null);
    const inputRef = useRef(null);
    const menuRef = useRef(null);

    useEffect(() => {
        if (!onSearch) return;
        clearTimeout(searchTimerRef.current);
        searchTimerRef.current = setTimeout(() => onSearch(searchKeyword), 300);
        return () => clearTimeout(searchTimerRef.current);
    }, [searchKeyword, onSearch]);

    const typeSafeValue = (Array.isArray(value) ? value : [value]).map(v => (options || []).find(o => looselyEqual((o?.value || o), (v?.value || v))) || v);

    const {
        ref,
        isSearching,
        setIsSearching
    } = useComponentVisible(false, [menuRef]);

    const computeMenuStyle = useCallback(() => {
        if (!inputRef.current || isTabular || isExpanded) return;
        const rect = inputRef.current.getBoundingClientRect();
        const menuHeight = menuRef.current?.offsetHeight || 0;
        const spaceBelow = window.innerHeight - rect.bottom - 8;
        const spaceAbove = rect.top - 8;
        const placeAbove = spaceBelow < menuHeight && spaceAbove > spaceBelow;
        if (placeAbove) {
            setMenuStyle({
                position: 'fixed',
                bottom: window.innerHeight - rect.top + 4,
                left: rect.left,
                width: rect.width,
                zIndex: 10000,
            });
        } else {
            setMenuStyle({
                position: 'fixed',
                top: rect.bottom + 4,
                left: rect.left,
                width: rect.width,
                zIndex: 10000,
            });
        }
    }, [isTabular, isExpanded]);

    useLayoutEffect(() => {
        if (isSearching) computeMenuStyle();
    }, [isSearching]);

    useEffect(() => {
        if (!isSearching) return;
        window.addEventListener('scroll', computeMenuStyle, true);
        window.addEventListener('resize', computeMenuStyle);
        return () => {
            window.removeEventListener('scroll', computeMenuStyle, true);
            window.removeEventListener('resize', computeMenuStyle);
        };
    }, [isSearching, computeMenuStyle]);

    const invalidValues = typeSafeValue.filter(v => v && (v.value || v) && !(options || [])?.some(o => (o.value || o) === (v.value || v)));

    return (
        <div ref={ref} className={`${t.mainWrapper} ${menuPosition === 'top' ? 'flex flex-col-reverse' : ''} ${loading ? 'cursor-wait' : ''}`}>
            {
                invalidValues.length && displayInvalidMsg ? <div className={t.error}>Invalid Values: {JSON.stringify(invalidValues)}</div> : null
            }

            {
                isTabular ? null :
                    <div ref={inputRef} className={t.inputWrapper} onClick={() => {
                        setIsSearching(!isSearching)
                    }}>
                        {
                            singleSelectOnly ? (() => {
                                const selected = typeSafeValue.filter(d => d)[0];
                                const rawLabel = selected && (meta?.[selected?.label || selected] || selected?.label || selected);
                                if (!rawLabel) return <span className={t.singlePlaceholder}>{placeholder || 'Select…'}</span>;
                                // React elements (e.g. an option whose label is <Icon/> + text)
                                // render as-is. Plain objects get JSON-stringified as a fallback.
                                if (React.isValidElement(rawLabel)) return rawLabel;
                                const text = typeof rawLabel === 'object' ? JSON.stringify(rawLabel) : rawLabel;
                                return <span className={t.singleValue}>{text}</span>;
                            })() :
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
                                            t={t}
                                        />) :
                                <div className={t.statusWrapper}>
                                    {typeSafeValue.length} selected
                                </div>
                        }
                        <span className={t.caretWrapper}>
                            <Icon icon={'ArrowDown'} className={t.caretIcon} />
                        </span>
                    </div>
            }

            {(() => {
                const menuJsx = (
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
                        searchable={searchable}
                        keepMenuOpen={isExpanded}
                        tabular={isTabular}
                        menuStyle={isTabular || isExpanded ? undefined : menuStyle}
                        menuRef={isTabular || isExpanded ? undefined : menuRef}
                        t={t}
                    />
                );
                // Compact mode: portal the menu to document.body so it escapes
                // ancestor stacking contexts / transforms (e.g., the settings
                // drawer's `transform` breaks `position: fixed` for descendants).
                // Tabular/expanded modes render inline below the trigger.
                if (isTabular || isExpanded || typeof document === 'undefined') return menuJsx;
                return createPortal(menuJsx, document.body);
            })()}
        </div>
    )
}

export const MultiSelectView = memo(function MultiSelectView ({className, value, options = [], meta, activeStyle, singleSelectOnly}){
    const { theme: themeFromContext = {} } = useContext(ThemeContext) || {};
    const t = { ...multiselectTheme.styles[0], ...getComponentTheme(themeFromContext, 'multiselect', activeStyle) };

    if (!value || (Array.isArray(value) && value.every(v => !v))) return <div className={t.mainWrapper} />

    const mappedValue = (Array.isArray(value) ? value : [value]).map(v => (options || []).find(o => looselyEqual((o.value || o), (v.value || v))) || v);

    if (singleSelectOnly) {
        const selected = mappedValue.filter(d => d)[0];
        const rawLabel = selected && (meta?.[selected?.label || selected] || selected?.label || selected);
        // React elements render as-is; plain objects fall back to JSON-stringify.
        const content = React.isValidElement(rawLabel)
            ? rawLabel
            : (rawLabel && typeof rawLabel === 'object' ? JSON.stringify(rawLabel) : rawLabel);
        return (
            <div className={t.mainWrapper}>
                <div className={className || t.singleValue}>{content}</div>
            </div>
        );
    }

    return (
        <div className={t.mainWrapper}>
            <div className={className || t.inputWrapper}>
                {(mappedValue).map((i, ii) => <RenderToken key={ii} token={i} meta={meta} isSearching={false}
                                                           setIsSearching={() => {}} t={t}/>)}
            </div>
        </div>
    )
})

// Back-compat aliases. The canonical names are MultiSelectEdit / MultiSelectView
// (capital S). The lowercase-S spellings were the previous convention; kept
// here so the column-type registry (`ColumnTypes.multiselect.EditComp`) and
// any external code referencing the old export names keep working.
export const MultiselectEdit = MultiSelectEdit;
export const MultiselectView = MultiSelectView;
