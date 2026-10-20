/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */
import React, {useEffect, useMemo, useRef, useState} from 'react';
import Button from './Button';
import { ThemeContext, getComponentTheme } from '../useTheme';
import { colorPickerTheme } from './Colorpicker.theme';

const basicColors = [
    '#d0021b',
    '#f5a623',
    '#f8e71c',
    '#8b572a',
    '#7ed321',
    '#417505',
    '#bd10e0',
    '#9013fe',
    '#4a90e2',
    '#50e3c2',
    '#b8e986',
    '#000000',
    '#4a4a4a',
    '#9b9b9b',
    '#ffffff',
];

const WIDTH = 214;


// the look is Colorpicker.theme.js (`colorPicker`), read through ThemeContext; the old hardcoded map (the pre-v6
// strings) is frozen for project themes in src/themes/_legacy/ui.js (2026-10-17)


function MoveWrapper({className, style, onChange, children}) {
    const divRef = useRef(null);

    const move = (e) => {
        if (divRef.current) {
            const {current: div} = divRef;
            const {width, height, left, top} = div.getBoundingClientRect();

            const x = clamp(e.clientX - left, width, 0);
            const y = clamp(e.clientY - top, height, 0);

            onChange({x, y, width, height});   // the area's own size: the maths never assumes its width
        }
    };

    const onMouseDown = (e) => {
        if (e.button !== 0) return;

        move(e);

        const onMouseMove = (_e) => {
            move(_e);
        };

        const onMouseUp = (_e) => {
            document.removeEventListener('mousemove', onMouseMove, false);
            document.removeEventListener('mouseup', onMouseUp, false);

            move(_e);
        };

        document.addEventListener('mousemove', onMouseMove, false);
        document.addEventListener('mouseup', onMouseUp, false);
    };

    return (
        <div
            ref={divRef}
            className={className}
            style={style}
            onMouseDown={onMouseDown}>
            {children}
        </div>
    );
}

function clamp(value, max, min) {
    return value > max ? max : value < min ? min : value;
}

function toHex(value) {
    if (!value.startsWith('#')) {
        const ctx = document.createElement('canvas').getContext('2d');

        if (!ctx) {
            throw new Error('2d context not supported or canvas already initialized');
        }

        ctx.fillStyle = value;

        return ctx.fillStyle;
    } else if (value.length === 4 || value.length === 5) {
        value = value
            .split('')
            .map((v, i) => (i ? v + v : '#'))
            .join('');

        return value;
    } else if (value.length === 7 || value.length === 9) {
        return value;
    }

    return '#000000';
}

function hex2rgb(hex) {
    const rbgArr = (
        hex
            .replace(
                /^#?([a-f\d])([a-f\d])([a-f\d])$/i,
                (m, r, g, b) => '#' + r + r + g + g + b + b,
            )
            .substring(1)
            .match(/.{2}/g) || []
    ).map((x) => parseInt(x, 16));

    return {
        b: rbgArr[2],
        g: rbgArr[1],
        r: rbgArr[0],
    };
}

function rgb2hsv({r, g, b}) {
    r /= 255;
    g /= 255;
    b /= 255;

    const max = Math.max(r, g, b);
    const d = max - Math.min(r, g, b);

    const h = d
        ? (max === r
        ? (g - b) / d + (g < b ? 6 : 0)
        : max === g
            ? 2 + (b - r) / d
            : 4 + (r - g) / d) * 60
        : 0;
    const s = max ? (d / max) * 100 : 0;
    const v = max * 100;

    return {h, s, v};
}

function hsv2rgb({h, s, v}) {
    s /= 100;
    v /= 100;

    const i = ~~(h / 60);
    const f = h / 60 - i;
    const p = v * (1 - s);
    const q = v * (1 - s * f);
    const t = v * (1 - s * (1 - f));
    const index = i % 6;

    const r = Math.round([v, q, p, p, t, v][index] * 255);
    const g = Math.round([t, v, v, q, p, p][index] * 255);
    const b = Math.round([p, p, t, v, v, q][index] * 255);

    return {b, g, r};
}

function rgb2hex({b, g, r}) {
    return '#' + [r, g, b].map((x) => x.toString(16).padStart(2, '0')).join('');
}

function transformColor(
    format,
    color,
) {
    let hex = toHex('#121212');
    let rgb = hex2rgb(hex);
    let hsv = rgb2hsv(rgb);

    if (format === 'hex') {
        hex = toHex(color);
        rgb = hex2rgb(hex);
        hsv = rgb2hsv(rgb);
    } else if (format === 'rgb') {
        rgb = color;
        hex = rgb2hex(rgb);
        hsv = rgb2hsv(rgb);
    } else if (format === 'hsv') {
        hsv = color;
        rgb = hsv2rgb(hsv);
        hex = rgb2hex(rgb);
    }
    return {hex, hsv, rgb};
}

 function ColorPicker (props) {
     const {color, onChange, colors, showColorPicker=true} = props;
    const { theme: themeFromContext = {} } = React.useContext(ThemeContext) || {};
    const t = { ...colorPickerTheme.styles[0], ...getComponentTheme(themeFromContext, 'colorPicker') };
    const [selfColor, setSelfColor] = useState(transformColor('hex', color));
    const [inputColor, setInputColor] = useState(color);
    const innerDivRef = useRef(null);

    // cursor positions in % of their area (2026-10-17): the square fills the padded wrapper, so it is narrower than
    // WIDTH — placing by px put the cursor outside it and the drag never reached full saturation
    const saturationPosition = useMemo(
        () => ({
            x: `${selfColor.hsv.s}%`,
            y: `${100 - selfColor.hsv.v}%`,
        }),
        [selfColor.hsv.s, selfColor.hsv.v],
    );

    const huePosition = useMemo(
        () => ({
            x: `${(selfColor.hsv.h / 360) * 100}%`,
        }),
        [selfColor.hsv],
    );

    const onSetHex = (hex) => {
        setInputColor(hex);
        if (/^#[0-9A-Fa-f]{6}$/i.test(hex)) {
            const newColor = transformColor('hex', hex);
            setSelfColor(newColor);
        }
    };

    const onMoveSaturation = ({x, y, width, height}) => {
        const newHsv = {
            ...selfColor.hsv,
            s: (x / width) * 100,
            v: 100 - (y / height) * 100,
        };
        const newColor = transformColor('hsv', newHsv);
        setSelfColor(newColor);
        setInputColor(newColor.hex);
    };

    const onMoveHue = ({x, width}) => {
        const newHsv = {...selfColor.hsv, h: (x / width) * 360};
        const newColor = transformColor('hsv', newHsv);

        setSelfColor(newColor);
        setInputColor(newColor.hex);
    };

    useEffect(() => {
        // Check if the dropdown is actually active
        if (innerDivRef.current !== null && onChange) {
            onChange(selfColor.hex);
            setInputColor(selfColor.hex);
        }
    }, [selfColor, onChange]);

    useEffect(() => {
        if (color === undefined) return;
        const newColor = transformColor('hex', color);
        setSelfColor(newColor);
        setInputColor(newColor.hex);
    }, [color]);

    const colorOptions = useMemo(() => colors || basicColors, [colors]);

    return (
        <div
            className={t.wrapper}
            style={{width: WIDTH}}
            ref={innerDivRef}>
            <div className={t.swatches}>
                {colorOptions.map((basicColor) => (
                    // a UI.Button named style (2026-10-17, raw-HTML pass); the fill stays the inline backgroundColor
                    <Button
                        activeStyle={basicColor === selfColor.hex ? t.swatchOnStyle : t.swatchStyle}
                        key={basicColor}
                        style={{backgroundColor: basicColor}}
                        onClick={() => {
                            setInputColor(basicColor);
                            setSelfColor(transformColor('hex', basicColor));
                        }}
                    />
                ))}
            </div>
            {
                showColorPicker ? (
                    <>
                        <MoveWrapper
                            className={t.saturation}
                            style={{
                                backgroundColor: `hsl(${selfColor.hsv.h}, 100%, 50%)`,
                                backgroundImage: 'linear-gradient(transparent, black), linear-gradient(to right, white, transparent)'
                            }}
                            onChange={onMoveSaturation}>
                            <div
                                className={t.saturationCursor}
                                style={{
                                    backgroundColor: selfColor.hex,
                                    left: saturationPosition.x,
                                    top: saturationPosition.y,
                                }}
                            />
                        </MoveWrapper>
                        <MoveWrapper className={t.hue} onChange={onMoveHue}>
                            <div
                                className={t.hueCursor}
                                style={{
                                    backgroundColor: `hsl(${selfColor.hsv.h}, 100%, 50%)`,
                                    left: huePosition.x,
                                }}
                            />
                        </MoveWrapper>
                        <div
                            className={t.sample}
                            style={{backgroundColor: selfColor.hex}}
                        />
                    </>
                ) : null
            }
        </div>
    );
}

/**
 * ColorPickerFlat - A flat/inline color picker without popups
 * Renders color swatches directly inline, suitable for use in menus
 */
export function ColorPickerFlat({ color, onChange, colors, showColorPicker = false }) {
    const { theme: themeFromContext = {} } = React.useContext(ThemeContext) || {};
    const t = { ...colorPickerTheme.styles[0], ...getComponentTheme(themeFromContext, 'colorPicker') };
    const [selfColor, setSelfColor] = useState(transformColor('hex', color || '#ffffff'));
    const colorOptions = useMemo(() => colors || basicColors, [colors]);

    useEffect(() => {
        if (color === undefined) return;
        const newColor = transformColor('hex', color);
        setSelfColor(newColor);
    }, [color]);

    const handleColorSelect = (selectedColor) => {
        const newColor = transformColor('hex', selectedColor);
        setSelfColor(newColor);
        onChange?.(newColor.hex);
    };

    return (
        <div className={t.flatWrapper}>
            {/* Current color indicator */}
            <div className={t.flatHeader}>
                <div className={t.flatCurrent} style={{ backgroundColor: selfColor.hex }} />
                <span className={t.flatHex}>{selfColor.hex}</span>
            </div>
            {/* Color swatches */}
            <div className={t.flatSwatches}>
                {colorOptions.map((basicColor) => (
                    // a UI.Button named style (2026-10-17, raw-HTML pass); the fill stays the inline backgroundColor
                    <Button
                        key={basicColor}
                        activeStyle={basicColor === selfColor.hex ? t.flatSwatchOnStyle : t.flatSwatchStyle}
                        style={{ backgroundColor: basicColor }}
                        onClick={(e) => {
                            e.stopPropagation();
                            handleColorSelect(basicColor);
                        }}
                    />
                ))}
            </div>
            {/* Optional: Full color picker with saturation/hue */}
            {showColorPicker && (
                <div className={t.flatFull} style={{ width: WIDTH }}>
                    <MoveWrapper
                        className={t.flatSaturation}
                        style={{
                            backgroundColor: `hsl(${selfColor.hsv.h}, 100%, 50%)`,
                            backgroundImage: 'linear-gradient(transparent, black), linear-gradient(to right, white, transparent)',
                            height: 100,
                        }}
                        onChange={({ x, y, width, height }) => {
                            const newHsv = {
                                ...selfColor.hsv,
                                s: (x / width) * 100,
                                v: 100 - (y / height) * 100,
                            };
                            const newColor = transformColor('hsv', newHsv);
                            setSelfColor(newColor);
                            onChange?.(newColor.hex);
                        }}
                    >
                        <div
                            className={t.saturationCursor}
                            style={{
                                backgroundColor: selfColor.hex,
                                left: `${selfColor.hsv.s}%`,
                                top: `${100 - selfColor.hsv.v}%`,
                            }}
                        />
                    </MoveWrapper>
                    <MoveWrapper
                        className={t.hue}
                        onChange={({ x, width }) => {
                            const newHsv = { ...selfColor.hsv, h: (x / width) * 360 };
                            const newColor = transformColor('hsv', newHsv);
                            setSelfColor(newColor);
                            onChange?.(newColor.hex);
                        }}
                    >
                        <div
                            className={t.hueCursor}
                            style={{
                                backgroundColor: `hsl(${selfColor.hsv.h}, 100%, 50%)`,
                                left: `${(selfColor.hsv.h / 360) * 100}%`,
                            }}
                        />
                    </MoveWrapper>
                </div>
            )}
        </div>
    );
}

export default ColorPicker;
