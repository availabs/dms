/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */

// import './ColorPicker.css';

import {useEffect, useMemo, useRef, useState} from 'react';
import * as React from 'react';

import { ThemeContext, getComponentTheme } from '../../../../useTheme';
import { colorPickerTheme } from '../../../Colorpicker.theme';
// 2026-10-17 (raw-HTML pass): the hex field + swatches render through UI primitives (the host UI wins; the imported
// ones cover a Provider-less mount — they don't import the editor, so no cycle). Was TextInput (unstyled) + raw buttons.
import DefaultInput from '../../../Input';
import DefaultButton from '../../../Button';
import DefaultFieldLabel from '../../../FieldLabel';

interface ColorPickerProps {
  color: string;
  onChange?: (color: string) => void;
}

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


// the look is the shared `colorPicker` theme (Colorpicker.theme.js; project themes: _legacy/ui.js, the same strings this
// file hardcoded) — `lexicalWrapper` is this dropdown's own body (2026-10-17)

export default function ColorPicker({
  color,
  onChange,
}: Readonly<ColorPickerProps>): JSX.Element {
  const { UI, theme: themeFromContext = {} } = React.useContext(ThemeContext) || {};
  // the swatch row is the shared `colorPicker` theme's (Colorpicker.theme.js; legacy = this file's old flex row): the
  // v6 swatch is a grid cell with no width of its own, so it must sit in the theme's grid, not a flex row (2026-10-17)
  const t = { ...colorPickerTheme.styles[0], ...getComponentTheme(themeFromContext, 'colorPicker') };
  const Input = UI?.Input || DefaultInput;
  const Button = UI?.Button || DefaultButton;
  const FieldLabel = UI?.FieldLabel || DefaultFieldLabel;
  const [selfColor, setSelfColor] = useState(transformColor('hex', color));
  const [inputColor, setInputColor] = useState(color);
  const innerDivRef = useRef(null);

  // cursor positions in % of their area (2026-10-17): the square fills the padded wrapper, narrower than WIDTH
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

  const onSetHex = (hex: string) => {
    setInputColor(hex);
    if (/^#[0-9A-Fa-f]{6}$/i.test(hex)) {
      const newColor = transformColor('hex', hex);
      setSelfColor(newColor);
    }
  };

  const onMoveSaturation = ({x, y, width, height}: Position) => {
    const newHsv = {
      ...selfColor.hsv,
      s: (x / width) * 100,
      v: 100 - (y / height) * 100,
    };
    const newColor = transformColor('hsv', newHsv);
    setSelfColor(newColor);
    setInputColor(newColor.hex);
  };

  const onMoveHue = ({x, width}: Position) => {
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

  return (
    <div
      className={t.lexicalWrapper}
      style={{width: WIDTH}}
      ref={innerDivRef}>
      <FieldLabel text="Hex">
        <Input value={inputColor} onChange={(e: React.ChangeEvent<HTMLInputElement>) => onSetHex(e.target.value)} />
      </FieldLabel>
      <div className={t.swatches}>
        {basicColors.map((basicColor) => (
          // the fill stays the inline backgroundColor
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
      <MoveWrapper
        className={t.saturation}
        // inline, not a class: an arbitrary-value multi-gradient utility compiles to no CSS under Tailwind v4 (the square
        // rendered flat — same fix as Colorpicker.jsx)
        style={{
          backgroundColor: `hsl(${selfColor.hsv.h}, 100%, 50%)`,
          backgroundImage: 'linear-gradient(transparent, black), linear-gradient(to right, white, transparent)',
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
    </div>
  );
}

export interface Position {
  x: number;
  y: number;
  width: number;    // the area's measured size, so the maths never assumes it
  height: number;
}

interface MoveWrapperProps {
  className?: string;
  style?: React.CSSProperties;
  onChange: (position: Position) => void;
  children: JSX.Element;
}

function MoveWrapper({className, style, onChange, children}: MoveWrapperProps) {
  const divRef = useRef<HTMLDivElement>(null);

  const move = (e: React.MouseEvent | MouseEvent): void => {
    if (divRef.current) {
      const {current: div} = divRef;
      const {width, height, left, top} = div.getBoundingClientRect();

      const x = clamp(e.clientX - left, width, 0);
      const y = clamp(e.clientY - top, height, 0);

      onChange({x, y, width, height});
    }
  };

  const onMouseDown = (e: React.MouseEvent): void => {
    if (e.button !== 0) return;

    move(e);

    const onMouseMove = (_e: MouseEvent): void => {
      move(_e);
    };

    const onMouseUp = (_e: MouseEvent): void => {
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

function clamp(value: number, max: number, min: number) {
  return value > max ? max : value < min ? min : value;
}

interface RGB {
  b: number;
  g: number;
  r: number;
}
interface HSV {
  h: number;
  s: number;
  v: number;
}
interface Color {
  hex: string;
  hsv: HSV;
  rgb: RGB;
}

function toHex(value: string): string {
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

function hex2rgb(hex: string): RGB {
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

function rgb2hsv({r, g, b}: RGB): HSV {
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

function hsv2rgb({h, s, v}: HSV): RGB {
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

function rgb2hex({b, g, r}: RGB): string {
  return '#' + [r, g, b].map((x) => x.toString(16).padStart(2, '0')).join('');
}

function transformColor<M extends keyof Color, C extends Color[M]>(
  format: M,
  color: C,
): Color {
  let hex: Color['hex'] = toHex('#121212');
  let rgb: Color['rgb'] = hex2rgb(hex);
  let hsv: Color['hsv'] = rgb2hsv(rgb);

  if (format === 'hex') {
    const value = color as Color['hex'];

    hex = toHex(value);
    rgb = hex2rgb(hex);
    hsv = rgb2hsv(rgb);
  } else if (format === 'rgb') {
    const value = color as Color['rgb'];

    rgb = value;
    hex = rgb2hex(rgb);
    hsv = rgb2hsv(rgb);
  } else if (format === 'hsv') {
    const value = color as Color['hsv'];

    hsv = value;
    rgb = hsv2rgb(hsv);
    hex = rgb2hex(rgb);
  }

  return {hex, hsv, rgb};
}
