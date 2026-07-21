import React, {useState, useEffect} from "react";
import { useLocation } from 'react-router';
import { isEqual, cloneDeep, set } from "lodash-es";

import { ThemeContext, getComponentTheme } from "../../../../ui/useTheme";
import { CMSContext, PageContext } from '../../context'

import { SectionEdit, SectionView } from './section'
import { isJson } from './section_utils'
import { sectionArrayTheme } from './sectionArray.theme'
import {useImmer} from "use-immer";

// ── Per-section chrome (border / radius / margin) ────────────────────────────
// Compound-card layout model (see
// planning/tasks/current/gap0-section-grid-compound-cards-migration.md): the band
// grid is gap-0 and spacing/borders/corners live on sections.
//   • border: new per-side shape { top,right,bottom,left } composes from the theme's
//     `borderSides` literal-class map; a legacy string key ('full'/'openLeft'/…)
//     still resolves via the theme's `border` preset map (radius baked in) for BC.
//   • radius: per-corner shape { tl,tr,bl,br } composes from `radiusCorners`.
//   • margin: a literal class string (picker-composed) wins; `defaultMargin` is the
//     fallback gutter AND the opt-in switch — themes that don't set it are untouched
//     (they keep their grid gap), so this is fully BC for un-migrated themes.
const resolveBorder = (border, theme) => {
    if (border && typeof border === "object") {
        // When width/color are set the border is drawn via inline style
        // (resolveBorderStyle) — don't ALSO emit the 1px side classes for those
        // sides or the two would stack into a double border. The class path stays
        // the sole source of truth only for the boolean-side case (BC).
        if (border.width != null || border.color != null) return "";
        return ["top", "right", "bottom", "left"]
            .filter(s => border[s]).map(s => theme?.borderSides?.[s] || "").join(" ");
    }
    return theme?.border?.[border || "none"] || "";
};
// Inline-style border, used ONLY when a section sets an explicit `width` (px) and/or
// `color` (hex) — arbitrary runtime widths/colors can't be JIT Tailwind classes, so
// the section-level border is drawn as inline style instead. For each toggled side
// emit border{Side}Width + border{Side}Style:'solid'; a single borderColor applies to
// all sides (width defaults to 1px, color to the theme's #E0EBF0 brand line). Returns
// {} when neither width nor color is set, so boolean-side / legacy-string borders keep
// the class path unchanged (fully backward-compatible).
const resolveBorderStyle = (border) => {
    if (!border || typeof border !== "object") return {};
    if (border.width == null && border.color == null) return {};
    const width = `${border.width || 1}px`;
    const style = { borderColor: border.color || "#E0EBF0" };
    ["Top", "Right", "Bottom", "Left"].forEach(Side => {
        if (border[Side.toLowerCase()]) {
            style[`border${Side}Width`] = width;
            style[`border${Side}Style`] = "solid";
        }
    });
    return style;
};
const resolveRadius = (radius, theme) => {
    if (radius && typeof radius === "object") {
        return ["tl", "tr", "bl", "br"]
            .filter(c => radius[c]).map(c => theme?.radiusCorners?.[c] || "").join(" ");
    }
    return "";
};
// Padding is the section's spacing primitive (NO margins — they fight grid/flex).
// On a gap-0 grid the inter-section gutter is the section wrapper's padding; per-side
// so the shared edge can be zeroed to compose a flush compound card. A literal string
// is used as-is (legacy/BC); a per-side object composes from `theme.paddings`, with
// `theme.sectionPadding` as the all-sides default.
const resolvePadding = (padding, theme) => {
    if (typeof padding === "string") return padding;            // legacy/literal
    const def = theme?.defaultPaddingStep;                      // per-side default step (gutter)
    const map = theme?.paddings || {};
    if (def == null) {                                          // un-migrated theme
        if (padding && typeof padding === "object") {
            return ["top", "right", "bottom", "left"]
                .filter(s => padding[s] != null && padding[s] !== "")
                .map(s => map?.[s]?.[padding[s]] || "").join(" ");
        }
        return theme?.sectionPadding || "";
    }
    // migrated theme: every side defaults to `def`; a per-side object overrides sides
    // (e.g. { bottom: "0" } zeroes the shared edge to fuse with the section below).
    const obj = (padding && typeof padding === "object") ? padding : {};
    return ["top", "right", "bottom", "left"].map(s => {
        const step = (obj[s] != null && obj[s] !== "") ? obj[s] : def;
        return map?.[s]?.[step] || "";
    }).filter(Boolean).join(" ");
};
// Background for the inner card box. A themed key (`theme.backgrounds[bg]`, e.g.
// white / tint / none) or a literal `bg-…` class. (Legacy `border:'full'` already
// bundles `bg-white`, so legacy cards keep their background without setting `bg`.)
const resolveBg = (bg, theme) =>
    theme?.backgrounds?.[bg] || (typeof bg === "string" && bg.startsWith("bg-") ? bg : "");
// The section's card chrome — rendered on an INNER box (inside the gutter padding) so
// the padding is a true gutter that separates bordered cards (and a shared edge can be
// zeroed to fuse two sections into one card). Content padding inside the card is the
// component's concern (a component-type setting), NOT the section gutter.
// The section's card chrome — rendered on an INNER box (inside the gutter padding).
// Content padding INSIDE the card is the COMPONENT's concern (e.g. the lexical
// component's own default padding), not the section.
const sectionChrome = (v, theme) =>
    `${resolveBorder(v?.border, theme)} ${resolveRadius(v?.radius, theme)} ${resolveBg(v?.bg, theme)}`.trim();

// Section height. The band is a CSS grid, so a section's cell already stretches
// to its row height; the chrome box inside it is content-height by default,
// which leaves a gap below the shorter of two side-by-side sections. `fill`
// makes both the cell and its chrome box `h-full` so the chrome reaches the
// bottom of the (stretched) cell and side-by-side compound cards compose flush.
// BC: unset/'auto' → '' (no class), so existing sections render byte-identically.
const resolveHeight = (v, theme) => {
    const h = v?.height;
    if (!h || h === 'auto') return '';
    // `fill` also makes the box a flex column so a section component (its child)
    // can `flex-1`/`h-full` up to the section height — see section.jsx fill styles
    // and Card.jsx mainWrapper. Presets/literal heights just set the height.
    return theme?.heights?.[h]?.className ?? (h === 'fill' ? 'h-full flex flex-col' : '');
};

const Edit = ({ value, onChange, attr, group, siteType }) => {
    const {hash} = useLocation();
    const { editPane, format, item  } =  React.useContext(PageContext) || {}
    const { theme:fullTheme = { sectionArray: sectionArrayTheme}, UI } = React.useContext(ThemeContext) || {}
    const theme = getComponentTheme(fullTheme, 'pages.sectionArray')
    const [ values, setValues ] = useImmer(value);
    const [edit, setEdit] = React.useState({
        index: -1,
        value: '',
        type: 'new'
    })
    const [ active, setActive ] = useState(); // to handle multiple spreadsheet components on a page in conjunction with arrow/selection/copy controls

    const { Icon } = UI;

    React.useEffect(() => {
        // if page changes while a section is being edited, reset.
        if(edit?.index >= 0) {
            setEdit({
                index: -1,
                value: '',
                type: 'new'
            })
        }
    }, [item?.id])

    React.useEffect(() => {
        //------------------------------------------
        // update value edit clone on receiving data
        // -----------------------------------------
        if (!value || !value.map) {
            setValues([''])
        }else if(!isEqual(value, values)) {
            setValues(value)
        }
    }, [value]);

    React.useEffect(() => {
        const id = setTimeout(() => {
            if(!isEqual(values, value)) {
                onChange(values);
            }
        }, 300);
        return () => clearTimeout(id);
    }, [values]);



    const setEditValue = (v) => setEdit({...edit, value: v})
    const setEditIndex = (i) => setEdit({...edit, index: i})

    const cancel = () => {
       setEdit({index: -1, value:'',type:'new'})
    }

    const saveIndex = (i, v) => {
        setValues(draft => {
            draft[i] = typeof v === 'object' && v ? { ...v, _dirty: true } : v;
        })
    }

    const save = /* async */ () => {

        let cloneValue = cloneDeep(value || [])
        const trackingId = crypto.randomUUID();
        let action = ''
        if(edit.type === 'update') {
            cloneValue[edit.index] = { ...edit.value, _dirty: true }

            action = `edited section ${edit?.value?.title ? `${edit?.value?.title} ${edit.index+1}` : edit.index+1}`
        } else {
            cloneValue.splice(edit.index, 0, {
                ...(edit.value || {}),
                trackingId,
                group: group?.name,
                is_draft: true,
                parent: JSON.stringify({
                    id: item.id,
                    ref: `${item.app}+${item.type}`
                })
            })
            action = `added section ${edit?.value?.title ? `${edit?.value?.title} ${edit.index+1}` : edit.index+1}`
        }
        //console.log('edit on save', edit)

        cancel()
        setValues([...cloneValue, ''])
        /* await */ onChange(cloneValue,action)

    }

    const remove = (i) => {
        let cloneValue = cloneDeep(value)

        if(edit.type === 'update') {
            cloneValue.splice(edit.index, 1)
        } else {
           cloneValue.splice(i, 1)
        }
        const action = `removed section ${edit?.value?.title ? `${edit?.value?.title} ${edit.index+1}` : edit.index+1}`
        //console.log('remove', value, cloneValue)
        // console.log('edit on remove', edit)
        cancel()
        onChange(cloneValue, action)
    }

    const update = (i) => {
        setEdit({index: i, value:value[i],type:'update'})
    }

    function moveItem(from, dir) {
        let cloneValue = cloneDeep(value)
        // remove `from` item and store it
        let to = from + dir

        if(to < 0 || to >= cloneValue.length){
            return
        }
        var f = cloneValue.splice(from, 1)[0];
        // insert stored item into position `to`
        cloneValue.splice(to, 0, f);
        onChange(cloneValue)
    }

    const hideDebug = true
    //console.log('test 123', values, group)

    let valuesToRender =  [...values,{}];
    if(edit.type === 'new') {
        valuesToRender.splice(edit.index, 0, {});
    }

    return (
        <div className={theme?.wrapper}>
        { editPane?.showGrid && (
            <div className={theme?.gridOverlay}>
                <div className={`
                        ${theme?.container}
                        ${theme?.gridviewGrid}
                        ${theme?.layouts[group?.full_width === 'show' ? 'fullwidth' : 'centered']}
                    `}
                >
                    {[...Array(theme?.gridSize).keys()].map(d => <div className={theme?.gridviewItem}  />)}
                </div>
            </div>
        )}
            <div className={`
                ${theme?.container}
                ${theme?.layouts?.[group?.full_width === 'show' ? 'fullwidth' : 'centered']}
            `}>

                {valuesToRender
                    //.filter(v => v.group === group.name || !v.group && group?.name === 'default')
                    .map((v,i) => {
                    // only render sections in this group
                    // but must render fragments for all to maintain indexes.
                    if(!(v.group === group.name || (!v.group && group?.name === 'default')) && i !== edit.index) {
                        //console.log('fragment',group.name, v.group)
                        return <React.Fragment key={i}></React.Fragment>
                    }

                    // Theme can declare what "no explicit size" means for new
                    // sections via `theme.defaultSize`. The legacy 6-col grid
                    // used "1" (= full width); a 12-col grid wants "12".
                    // Falls back to "1" so existing themes are unaffected.
                    const defaultSize = theme?.defaultSize || "1";
                    const size = (edit.index === i ? edit?.value?.size : v?.size) || defaultSize;
                    const rowspan = (edit.index === i ? edit?.value?.rowspan : v?.rowspan) || "1";
                    const isSticky = (edit.index === i ? edit?.value?.sticky : v?.sticky) || false;
                    const stickyTop = (edit.index === i ? edit?.value?.stickyTop : v?.stickyTop ) || 0;
                    const colspanClass = (theme?.sizes?.[size] || theme?.sizes?.[defaultSize])?.className;
                    const rowspanClass = (theme?.rowspans?.[rowspan] || theme?.rowspans?.["1"])?.className
                    // Inline border style — non-empty only when the section set width/color.
                    const cardBorderStyle = resolveBorderStyle(v?.border);

                    // console.log('section', v, v.error)
                    return (
                        <div
                            key={i}
                            id={v?.id}
                            className={`
                                ${resolvePadding(v?.padding, theme)}
                                ${theme?.sectionEditWrapper}
                                ${colspanClass} ${rowspanClass}
                                ${resolveHeight(v, theme)}
                            `}
                            style={{paddingTop: v?.offset }}
                            onClick={() => {
                                if(active === v.id) return;

                                if (v?.element?.['element-type'] === 'Spreadsheet' && active !== v?.id) {
                                    setActive(v.id);
                                }else if(v.id){
                                    setActive(undefined)
                                }
                            }}
                        >
                            <div className={edit.index === i ? theme?.sectionEditing : hash === `#${v.id}` ? theme?.sectionHighlight : theme?.sectionEditHover} />
                            {/* add to top */}
                            {
                                edit?.index === -1 && <div
                                    className={theme?.addSectionButton}>
                                    <div className={theme?.spacer} />
                                    <div className={theme?.addSectionIconWrapper} onClick={() => setEditIndex(Math.max(i, 0))}>
                                        <div><Icon icon='Plus' className={theme?.addSectionIcon}/></div>
                                        <div className={theme?.addSectionTextWrapper}><div className={theme?.addSectionText}>Add</div></div>
                                    </div>
                                    <div className={theme?.spacer} />
                                </div>
                             }

                            {/* Inner card box — carries the section's chrome (border /
                                radius / bg) inside the gutter padding, so the gutter
                                separates bordered cards and a zeroed shared edge fuses
                                two sections into one card. */}
                            <div
                                className={`${sectionChrome(v, theme)} ${resolveHeight(v, theme)}`.trim()}
                                style={
                                    (rowspan > 1 && isSticky)
                                        ? { ...cardBorderStyle, position: 'sticky', top: stickyTop }
                                        : (Object.keys(cardBorderStyle).length ? cardBorderStyle : undefined)
                                }
                            >
                            {/* edit new or existing section */}
                            {edit.index === i
                                ? <SectionEdit
                                    // key={v.id} having key introduces bugs while adding a new section
                                    i={i}
                                    value={edit.value}
                                    attributes={attr?.attributes}
                                    siteType={siteType}
                                    format={format}
                                    onChange={setEditValue}
                                    onSave={save}
                                    onCancel={cancel}
                                    onRemove={remove}
                                    moveItem={moveItem}
                                />
                                : ''
                            }

                            {/* show section if not being edited */}
                            { v !== '' && !(edit.index === i && edit.type === 'update') ?
                                <SectionView
                                    key={v.id} // to prevent value glitch while removing sections
                                    i={i}
                                    value={v}
                                    attributes={attr?.attributes}
                                    siteType={siteType}
                                    format={format}
                                    isActive={v?.element?.['element-type'] === 'Spreadsheet' ? active === v?.id : undefined}
                                    editPageMode={true}
                                    moveItem={moveItem}
                                    onRemove={remove}
                                    onChange={ saveIndex }
                                    // addAbove={() => setEditIndex(i)}
                                    onEdit={ edit.index === -1 ? (e) => update(i)  : null }
                                /> : v?.status?.length > 1 ? <div>Error</div> : ''}
                            </div>

                            {/* add new section at end  */}

                        </div>
                    )
                })
            }
            {
                edit?.index === -1 ? <AddSectionButton onClick={() => setEditIndex(Math.max(values.length, 0))}/> : ''
            }

            </div>
        </div>
    )
}

const View = ({value, attr, group, siteType}) => {
    if (!value || !value.map) { return '' }
    const {hash} = useLocation();
    const { format  } =  React.useContext(PageContext) || {}
    const [active, setActive] = useState();
    const { theme:fullTheme = {sectionArray: sectionArrayTheme} } = React.useContext(ThemeContext);
    const theme = getComponentTheme(fullTheme,'pages.sectionArray')

    const hideSectionCondition = section => {
        //console.log('hideSectionCondition', section?.element?.['element-data'] || '{}')
        let value = section?.element?.['element-data']
        let elementData = typeof value === 'object' ?
            value : value && isJson(value) ? JSON.parse(value) : {}
        return !elementData?.hideSection && !elementData?.display?.hideSection && !section?.hideInView;
    }

    return (
        <div
            className={`
                ${theme?.container}
                ${theme?.layouts?.[group?.full_width === 'show' ? 'fullwidth' : 'centered']}
            `}
        >
            {
                value.filter(v => hideSectionCondition(v))
                    .filter(v => v.group === group.name || (!v.group && group?.name === 'default'))
                    //.sort((a,b) => a.order - b.order)
                    .map((v, i) => {
                        const defaultSize = theme?.defaultSize || "1";
                        const size = v?.size || defaultSize;
                        const rowspan = v?.rowspan || "1";
                        const isSticky = v?.sticky || false;
                        const colspanClass = (theme?.sizes?.[size] || theme?.sizes?.[defaultSize])?.className;
                        const rowspanClass = (theme?.rowspans?.[rowspan] || theme?.rowspans?.["1"])?.className;
                        // Inline border style — non-empty only when the section set width/color.
                        const cardBorderStyle = resolveBorderStyle(v?.border);

                        return (
                            <div id={v?.id} key={i}
                                className={`
                                    ${v?.is_header ? '' : resolvePadding(v?.padding, theme)}
                                    ${theme?.sectionViewWrapper}
                                    ${hash === `#${v.id}` ? theme?.sectionHighlight : ``}
                                    ${colspanClass} ${rowspanClass}
                                    ${resolveHeight(v, theme)}
                                `}
                                style={{ paddingTop: v?.offset }}
                                 onClick={() => {
                                     if(active === v.id) return;
                                     if (v?.element?.['element-type'] === 'Spreadsheet' && active !== v?.id) {
                                         setActive(v.id);
                                     }else if(v.id){
                                         setActive(undefined)
                                     }
                                 }}
                            >
                                {/* Inner card box — section chrome (border/radius/bg)
                                    inside the gutter padding. */}
                                <div
                                    className={`${sectionChrome(v, theme)} ${resolveHeight(v, theme)}`.trim()}
                                    style={
                                        (rowspan > 1 && isSticky)
                                            ? { ...cardBorderStyle, position: 'sticky', top: v?.stickyTop || 0 }
                                            : (Object.keys(cardBorderStyle).length ? cardBorderStyle : undefined)
                                    }
                                >
                                <SectionView
                                    key={v?.id || i}
                                    i={i}
                                    value={v}
                                    attributes={attr?.attributes}
                                    siteType={siteType}
                                    format={format}
                                    isActive={v?.element?.['element-type'] === 'Spreadsheet' ? active === v?.id : undefined}
                                />
                                </div>
                            </div>
                        )
                    })
            }
        </div>
    )
}



export default {
    "EditComp": Edit,
    "ViewComp": View
}


const AddSectionButton = ({onClick}) => {
    const { theme:fullTheme = {}, UI} = React.useContext(ThemeContext);
    const theme = getComponentTheme(fullTheme, 'pages.sectionArray')
    const {Icon} = UI;
    return (
        <div
            className={`
                p-[1px]
                ${theme?.sectionEditWrapper}
                ${theme?.sizes?.[theme?.defaultSize || "1"]?.className}
                ${theme?.rowspans?.["1"]?.className}
            `}
        >
            <div className={theme?.sectionEditHover} />
                <div
                    onClick={onClick}
                    className={theme?.addSectionButton}>
                    <div className={theme?.spacer} />
                    <div className={theme?.addSectionIconWrapper}>
                        <div><Icon icon='Plus' className={theme?.addSectionIcon}/></div>
                        <div className={theme?.addSectionTextWrapper}><div className={theme?.addSectionText}>Add</div></div>
                    </div>
                    <div className={theme?.spacer} />
                </div>
        </div>
    )
}
