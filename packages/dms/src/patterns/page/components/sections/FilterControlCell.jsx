import React, {useContext, useEffect, useMemo, useRef, useState} from "react";
import {ThemeContext, getComponentTheme} from "../../../../ui/useTheme";
import {ComponentContext, PageContext} from "../../context";
import {MultiSelectEdit} from "../../../../ui/components/MultiSelect";
import Input from "../../../../ui/components/Input";
import Icon from "../../../../ui/components/Icon";
import {useColumnOptions} from "./ConditionValueInput";
import {filterControlCellTheme} from "./FilterControlCell.theme";

// `filter_control` column type — a Card cell that IS a filter control.
//
// The column config carries the wiring (all optional except `name`):
//   name                the source column whose distinct values populate the
//                       picker (and the default page-variable key)
//   searchParamKey      the page variable this control writes (default: `name`).
//                       Must be REGISTERED on the page (page.filters[]) to reach
//                       the URL / other sections — same rule as every page variable.
//   controlOp           'filter' (select picker, default) | 'like' (text/search
//                       box, debounced) | 'toggle' (checkbox writing controlValue)
//   controlValue        the value a 'toggle' writes when checked (default '1' —
//                       for boolean-attribute filters use e.g. 'Yes')
//   isMulti             multi-select (default false → single select w/ deselect ×)
//   placeholder         empty-state text (e.g. "All", "Search actions…")
//   controlLabel        label rendered INSIDE the pill (falls back to customName)
//   controlIcon         Icon-registry name rendered before the label/control
//                       (e.g. 'Search' for the search pill)
//   excludeOptionValues raw values to hide from the picker's option list (e.g.
//                       a sentinel like 'NA' that the page's normalized leaves
//                       fold into another label)
//   optionLabels        { rawValue: displayLabel } — design-vocabulary relabels
//                       for options AND selected tokens; the written page-variable
//                       value stays raw
//   activeStyle         named style for the control itself — resolves against
//                       theme.multiselect / theme.input styles[] (e.g. 'pill')
//
// State contract: PAGE-VARIABLE-ONLY. The control reads its value from
// pageState.filters and writes through updatePageStateFilters — it owns no
// section-state filter leaf. Data sections (including the host Card) react
// through their own `usePageFilters` leaves, exactly as with a Filter section.
//
// Option scoping: the picker's option list is narrowed by the HOST CARD's own
// authored filter tree (state.filters), minus any leaf wired to this control's
// page variable (or naming its column) — so a county-scoping leaf narrows
// every picker, sibling selections cascade, and a control never narrows
// itself out of its own alternatives.
const pruneTreeForControl = (tree, colName, paramKey) => {
    const walk = (n) => {
        if (!n) return null;
        if (n.groups) {
            const groups = n.groups.map(walk).filter(Boolean);
            return groups.length ? { ...n, groups } : null;
        }
        if (n.col === colName) return null;
        if ((n.searchParamKey || n.col) === paramKey) return null;
        return n;
    };
    return tree?.groups ? walk(tree) : null;
};

const LIKE_DEBOUNCE_MS = 400;

export const FilterControlCell = ({
    name, searchParamKey, controlOp = 'filter', controlValue = '1', isMulti,
    placeholder, controlLabel, customName, controlIcon,
    excludeOptionValues, optionLabels, activeStyle,
}) => {
    const { state } = useContext(ComponentContext) || {};
    const { pageState, updatePageStateFilters } = useContext(PageContext) || {};
    const { theme: themeFromContext = {} } = useContext(ThemeContext) || {};
    const t = { ...filterControlCellTheme, ...getComponentTheme(themeFromContext, 'filterControlCell') };

    const key = searchParamKey || name;
    const isLike = controlOp === 'like';
    const isToggle = controlOp === 'toggle';

    // the live value — pageState (seeded from the page registry + URL/pattern
    // filters) is the source of truth; the control renders whatever it holds
    const pageVals = useMemo(() => {
        const vals = (pageState?.filters || []).find(pf => pf.searchKey === key)?.values;
        return Array.isArray(vals)
            ? vals.filter(v => v != null && String(v).length)
            : (vals != null && String(vals).length ? [vals] : []);
    }, [pageState?.filters, key]);

    const [search, setSearch] = useState('');
    const siblingFilterTree = useMemo(
        () => pruneTreeForControl(state?.filters, name, key),
        [state?.filters, name, key]
    );
    // no-ops internally for non-select ops — safe to call unconditionally
    const { options, loading } = useColumnOptions(
        name, state?.columns || [], (isLike || isToggle) ? 'like' : 'filter',
        search, pageVals, siblingFilterTree
    );

    // design-vocabulary shaping: drop sentinel values; relabel the rest.
    // Values written to the page variable stay RAW either way.
    const shapedOptions = useMemo(() => {
        const excluded = new Set(excludeOptionValues || []);
        return (options || [])
            .filter(o => !excluded.has(o?.value ?? o))
            .map(o => {
                const v = o?.value ?? o;
                const mapped = optionLabels?.[v];
                return mapped ? { ...(typeof o === 'object' ? o : { value: v }), label: mapped } : o;
            });
    }, [options, excludeOptionValues, optionLabels]);

    const write = (newValues) => {
        if (!updatePageStateFilters) return;
        const current = (pageState?.filters || [])
            .filter(f => f.searchKey !== key)
            .map(f => ({ searchKey: f.searchKey, values: f.values }));
        if (newValues.length) current.push({ searchKey: key, values: newValues });
        updatePageStateFilters(current, { [key]: !newValues.length });
    };

    // 'like' is DEBOUNCED: each write is a navigation + a refetch of every
    // reacting section, so keystrokes buffer locally and flush after a pause.
    // External changes (clear-all, back/forward) re-seed the local value.
    const [likeValue, setLikeValue] = useState(pageVals[0] ?? '');
    const likeTimer = useRef(null);
    const likeDirty = useRef(false);
    useEffect(() => {
        if (!likeDirty.current) setLikeValue(pageVals[0] ?? '');
    }, [pageVals]);
    useEffect(() => () => clearTimeout(likeTimer.current), []);
    const onLikeChange = (v) => {
        likeDirty.current = true;
        setLikeValue(v);
        clearTimeout(likeTimer.current);
        likeTimer.current = setTimeout(() => {
            likeDirty.current = false;
            write(v.length ? [v] : []);
        }, LIKE_DEBOUNCE_MS);
    };

    const label = controlLabel || customName;
    const toggleOn = isToggle && pageVals.includes(controlValue);

    return (
        // toggles may take their own cell wrapper (`toggleCellWrapper`) — designs
        // often render checkboxes BARE while the selects/search keep the pill
        // chrome. Falls back to `wrapper`, so themes without it are unchanged.
        <div className={(isToggle && t.toggleCellWrapper) || t.wrapper}>
            {controlIcon ? <Icon icon={controlIcon} className={t.icon} /> : null}
            {isToggle ? (
                <label className={t.toggleWrapper}>
                    <input
                        type={'checkbox'}
                        className={t.checkbox}
                        checked={toggleOn}
                        onChange={() => write(toggleOn ? [] : [controlValue])}
                    />
                    {label ? <span className={t.toggleLabel || t.label}>{label}</span> : null}
                </label>
            ) : (
                <>
                    {label ? <span className={t.label}>{label}</span> : null}
                    {isLike ? (
                        <Input
                            activeStyle={activeStyle}
                            type={'text'}
                            value={likeValue}
                            placeholder={placeholder || 'search...'}
                            onChange={e => onLikeChange(e?.target?.value ?? '')}
                        />
                    ) : (
                        <MultiSelectEdit
                            activeStyle={activeStyle}
                            value={pageVals}
                            options={shapedOptions}
                            meta={optionLabels}
                            loading={loading}
                            placeholder={placeholder}
                            singleSelectOnly={!isMulti}
                            allowDeselect={!isMulti}
                            displayDetailedValues={true}
                            displayInvalidMsg={false}
                            onSearch={setSearch}
                            onChange={(e) => {
                                const newValues = (Array.isArray(e) ? e : [e])
                                    .map(item => item?.value ?? item)
                                    .filter(v => v != null && String(v).length);
                                write(newValues);
                            }}
                        />
                    )}
                </>
            )}
        </div>
    );
};
