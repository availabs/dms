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
//   optionSort          'label' (default — alphabetical by the shown label) |
//                       'value-asc' | 'value-desc'. Sort by VALUE when the label is a
//                       formatted form of a sortable value: dates formatted as
//                       "Mon, Sep 14, 2026" sort alphabetically by weekday otherwise.
//   defaultOption       'max' | 'min' (by value) — when the page variable is EMPTY,
//                       write that option once the list loads, so the page opens on
//                       e.g. the newest airing rather than "everything". Implies no
//                       deselect (clearing would only re-select it).
//   stepButtons         render ‹ › either side of the select. ‹ moves to the next
//                       LOWER value, › to the next higher one, whatever the list's
//                       display order; disabled at either end. Single select only.
//   optionCounts        label each option with its row count (one grouped query),
//   optionCountFormat   using this template: `{label}` and `{n}`, default
//                       '{label} ({n})' — e.g. '{label} · {n} spins'.
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

// Option values arrive as strings. Compare numerically when both are numbers,
// otherwise as text — ISO dates and keys like `183:2026-09-14` sort correctly as text.
const compareValues = (a, b) => {
    const na = Number(a), nb = Number(b);
    if (a !== '' && b !== '' && Number.isFinite(na) && Number.isFinite(nb)) return na - nb;
    return String(a).localeCompare(String(b));
};

export const FilterControlCell = ({
    name, searchParamKey, controlOp = 'filter', controlValue = '1', isMulti,
    placeholder, controlLabel, customName, controlIcon,
    excludeOptionValues, optionLabels, activeStyle,
    optionSort, defaultOption, stepButtons, optionCounts, optionCountFormat,
}) => {
    const { state } = useContext(ComponentContext) || {};
    const { pageState, updatePageStateFilters } = useContext(PageContext) || {};
    const { theme: themeFromContext = {}, UI } = useContext(ThemeContext) || {};
    const t = { ...filterControlCellTheme, ...getComponentTheme(themeFromContext, 'filterControlCell') };
    const CheckboxEdit = UI?.ColumnTypes?.checkbox?.EditComp;

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
        search, pageVals, siblingFilterTree, null, !!optionCounts, [], optionCountFormat || null
    );

    // design-vocabulary shaping: drop sentinel values; relabel the rest.
    // Values written to the page variable stay RAW either way.
    const shapedOptions = useMemo(() => {
        const excluded = new Set(excludeOptionValues || []);
        const shaped = (options || [])
            .filter(o => !excluded.has(o?.value ?? o))
            .map(o => {
                const v = o?.value ?? o;
                const mapped = optionLabels?.[v];
                return mapped ? { ...(typeof o === 'object' ? o : { value: v }), label: mapped } : o;
            });
        if (optionSort === 'value-asc' || optionSort === 'value-desc') {
            const dir = optionSort === 'value-desc' ? -1 : 1;
            shaped.sort((a, b) => dir * compareValues(a?.value ?? a, b?.value ?? b));
        }
        return shaped;
    }, [options, excludeOptionValues, optionLabels, optionSort]);

    // Every option value in ascending order — what defaultOption and the ‹ › steps
    // walk, independent of the order the list displays in.
    const ascValues = useMemo(
        () => shapedOptions.map(o => o?.value ?? o).sort(compareValues),
        [shapedOptions]
    );

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

    // defaultOption: fill an EMPTY page variable once the options arrive. Runs again
    // only if the variable is emptied by something else (e.g. a clear-all control).
    const hasDefault = (defaultOption === 'max' || defaultOption === 'min') && !isLike && !isToggle && !isMulti;
    useEffect(() => {
        if (!hasDefault || loading || pageVals.length || !ascValues.length) return;
        write([defaultOption === 'max' ? ascValues[ascValues.length - 1] : ascValues[0]]);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [hasDefault, loading, pageVals.length, ascValues]);

    const showSteps = stepButtons && !isLike && !isToggle && !isMulti;
    const current = pageVals[0];
    const idx = current == null ? -1 : ascValues.findIndex(v => String(v) === String(current));
    const prevValue = idx > 0 ? ascValues[idx - 1] : null;
    const nextValue = idx >= 0 && idx < ascValues.length - 1 ? ascValues[idx + 1] : null;
    const stepButton = (value, dir) => (
        <button
            type="button"
            className={value == null ? t.stepButtonDisabled : t.stepButton}
            disabled={value == null}
            aria-label={dir === 'prev' ? 'Previous' : 'Next'}
            onClick={() => value != null && write([value])}
        >
            <Icon icon={dir === 'prev' ? t.stepPrevIcon : t.stepNextIcon} className={t.stepIcon} />
        </button>
    );

    const label = controlLabel || customName;
    const toggleOn = isToggle && pageVals.includes(controlValue);

    const pill = (
        // toggles may take their own cell wrapper (`toggleCellWrapper`) — designs
        // often render checkboxes BARE while the selects/search keep the pill
        // chrome. Falls back to `wrapper`, so themes without it are unchanged.
        <div className={(isToggle && t.toggleCellWrapper) || t.wrapper}>
            {controlIcon ? <Icon icon={controlIcon} className={t.icon} /> : null}
            {isToggle ? (
                // the checkbox column type with its text (2026-10-16, raw-HTML pass): the look is a checkbox named
                // style picked by `toggleCheckboxStyle` — a project theme's own toggleWrapper / checkbox / toggleLabel
                // strings become that style (src/themes/_legacy/ui.js liftPatternRoles)
                <CheckboxEdit
                    activeStyle={t.toggleCheckboxStyle}
                    value={toggleOn}
                    rowLabel={label || undefined}
                    onChange={v => write(v ? [controlValue] : [])}
                />
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
                            allowDeselect={!isMulti && !hasDefault}
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

    if (!showSteps) return pill;
    return (
        <div className={t.stepRow}>
            {stepButton(prevValue, 'prev')}
            {pill}
            {stepButton(nextValue, 'next')}
        </div>
    );
};
