import React, {useContext, useMemo, useState} from "react";
import { ThemeContext, getComponentTheme } from "../../../../../../../ui/useTheme";
import { sectionMenuTheme } from "../../../sectionMenu.theme";
const defaultColorOptions = [
    "#FFFFFF",
    "#F3F8F9",
    "#FCF6EC"
];
export default function ColorControls ({value='#FFFFFF', setValue, title, className, colors}) {
    const {UI, theme: themeFromContext = {}} = useContext(ThemeContext);
    const {ColorPicker} = UI;
    // pages.sectionMenu color* keys (were hardcoded bg-white — a white band in dark mode)
    const sm = { ...sectionMenuTheme, ...getComponentTheme(themeFromContext, 'pages.sectionMenu') };
    const [open, setOpen] = useState(false);
    const colorOptions = useMemo(() => colors || defaultColorOptions, [colors]);
    if(!setValue) return null;

    // The picker renders IN FLOW under the row (full width), not absolutely: inside a long
    // NavigableMenu (the Card cell menu) an absolute popup landed below the viewport, so a click on
    // the swatch looked like it did nothing (2026-10-08, every theme).
    return (
        <div className={sm.colorWrap}>
            <div className={sm.colorRow} onClick={() => setOpen(!open)}>
                <label className={sm.colorLabel}>{title}</label>
                <div id={'background'}
                     className={sm.colorSwatch}
                     style={{backgroundColor: value}}
                />
            </div>
            {
                open ? (
                    <div className={sm.colorPopup} onClick={e => e.stopPropagation()}>
                        <ColorPicker color={value} onChange={setValue} colors={colorOptions} showColorPicker={false}/>
                    </div>
                ) : null
            }
        </div>
    )
}