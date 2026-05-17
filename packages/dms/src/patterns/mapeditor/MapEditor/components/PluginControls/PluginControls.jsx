import React, { useMemo, useEffect, Fragment, useState } from "react";
import { SymbologyContext } from "../../";
import { MapContext} from "../../../../page/components/sections/components/ComponentRegistry/map"
import {get, set} from "lodash-es";
import { ThemeContext } from "../../../../../ui/themeContext";

export function SelectControl({ path, params = {} }) {
  //console.log("select control path::", path)
  const mctx = React.useContext(MapContext);
  const sctx = React.useContext(SymbologyContext);
  const ctx = mctx?.falcor ? mctx : sctx;
  const { state, setState } = ctx
  // console.log('select control params::', params)
  // console.log("select control state::", state)
//   console.log("select control value::", get(state, `${path}`))
// console.log("select control, state::", state)
  const defaultValue =
    params.default !== null && params.default !== undefined
      ? params.default
      : params?.options?.[0]?.value;
  return (
    <label className="flex w-full">
      <div className="flex w-full items-center">
        <select
          className="w-full py-2 bg-transparent capitalize"
          value={get(state, `${path}`, defaultValue)}
          onChange={(e) =>
            setState((draft) => {
              set(draft, `${path}`, e.target.value);
            })
          }
        >
          {(params?.options || []).map((opt, i) => {
            return (
              <option key={i} value={opt.value}>
                {opt.name}
              </option>
            );
          })}
        </select>
      </div>
    </label>
  );
}

export function MultiSelectControl({ path, params = {} }) {
  const mctx = React.useContext(MapContext);
  const sctx = React.useContext(SymbologyContext);
  const ctx = mctx?.falcor ? mctx : sctx;
  const { state, setState } = ctx;
  const { UI } = React.useContext(ThemeContext) || {};

  const defaultValue =
    params.default !== null && params.default !== undefined
      ? params.default
      : params?.options?.[0]?.value;

  const curValue = useMemo(() => {
    return get(state, `${path}`, defaultValue);
  }, [state]);

  const selectedValues = Array.isArray(curValue) ? curValue : curValue ? [curValue] : [];

  const toggleValue = (val) => {
    const next = selectedValues.some(v => v.value === val.value)
      ? selectedValues.filter(v => v.value.toString() !== val.value.toString())
      : [...selectedValues, val];
    setState((draft) => { set(draft, `${path}`, next); });
  };

  return (
    <label className="flex w-full">
      <div className="flex flex-col w-full capitalize">
        <div className="flex flex-wrap gap-1 mb-1">
          { params?.options?.length && selectedValues.map((v, i) => {
            const opt = params?.options.find(o => o?.value?.toString() === v?.value?.toString());
            return (
              <span key={i} className="inline-flex items-center px-2 py-0.5 rounded bg-blue-100 text-blue-800 text-xs">
                { opt?.label || v }
                <span onClick={() => toggleValue(opt)} className="ml-1 cursor-pointer hover:text-red-500">&times;</span>
              </span>
            )
          })}
        </div>
        <select
          className="w-full py-2 bg-transparent capitalize border rounded text-sm"
          value=""
          onChange={e => {
            if (e.target.value){
             toggleValue(JSON.parse(e.target.value))}; 
            }
          }
        >
          <option value="">{ params.placeholder || "Select a value..." }</option>
          { params?.options
            .filter(opt => !selectedValues.includes(opt.value))
            .map((opt, i) => (
              <option key={i} value={JSON.stringify(opt)}>{ opt.label }</option>
            ))
          }
        </select>
      </div>
    </label>
  );
}

export function InputControl({ path, params = {} }) {
  //console.log("input control path::", path)
  // const mctx = React.useContext(MapContext);
  // const sctx = React.useContext(SymbologyContext);
  // const ctx = mctx?.falcor ? mctx : sctx;
  const { state, setState } = React.useContext(SymbologyContext);
  //console.log('input control', params)

  const defaultValue =
    params.default !== null && params.default !== undefined
      ? params.default
      : params?.options?.[0]?.value;

  return (
    <label className="flex w-full">
      <div className="flex w-full items-center">
        <input
          className="w-full py-2 bg-transparent"
          value={get(state, `${path}`, defaultValue)}
          onChange={(e) =>
            setState((draft) => {
              set(draft, `${path}`, e.target.value);
            })
          }
        />
      </div>
    </label>
  );
}

export function RadioControl({ path, params = {} }) {
  // const mctx = React.useContext(MapContext);
  // const sctx = React.useContext(SymbologyContext);
  // const ctx = mctx?.falcor ? mctx : sctx;
  const { state, setState } = React.useContext(SymbologyContext);

  const defaultValue =
    params.default !== null && params.default !== undefined
      ? params.default
      : params?.options?.[0]?.value;

  return (
    <label className="flex w-full">
      <div className="flex w-full items-center">
        {params.options.map((opt) => (
          <span key={`${path}_opt_${opt.value}`}>
            <label
              htmlFor={"enableGroupedBy"}
              className="ml-2 text-sm text-gray-900"
            >
              {opt.name}
            </label>
            <input
              name={path}
              checked={get(state, `${path}`) === opt.value}
              type="radio"
              className="w-full py-2 bg-transparent"
              value={opt.value}
              onChange={(e) =>
                setState((draft) => {
                  set(draft, `${path}`, opt.value);
                })
              }
            />
          </span>
        ))}
      </div>
    </label>
  );
}

export function ToggleControl({path, params={title:""}}) {
  const { state, setState } = React.useContext(SymbologyContext);
  const { UI } = React.useContext(ThemeContext) || {};
  const { Switch } = UI || {};
  const defaultValue =
    params.default !== null && params.default !== undefined
      ? params.default
      : params?.options?.[0]?.value;

  const curValue = useMemo(() => {
    return get(state, `${path}`, defaultValue);
  }, [state]);

  return (
    <div className='flex items-center'>
      <Switch
        enabled={!!curValue}
        setEnabled={() => {
          setState(draft => {
            set(draft, `${path}`, !curValue);
          });
        }}
        size={'small'}
      />
    </div>
  )
}

export const pluginControlTypes = {
  select: SelectControl,
  text: InputControl,
  radio: RadioControl,
  multiselect: MultiSelectControl,
  toggle: ToggleControl,
};
