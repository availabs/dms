import React, { useMemo, useEffect, Fragment, useState } from "react";
import { Switch } from '@headlessui/react'
import { SymbologyContext } from "../../";
// import {MapContext} from '../dms/map/MapComponent'
import get from "lodash/get";
import set from "lodash/set";

import { MultiLevelSelect } from "~/modules/avl-map-2/src"

export function SelectControl({ path, params = {} }) {
  //console.log("select control path::", path)
  // const mctx = React.useContext(MapContext);
  // const sctx = React.useContext(SymbologyContext);
  // const ctx = mctx?.falcor ? mctx : sctx;
  const { state, setState } = React.useContext(SymbologyContext);
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
  // const mctx = React.useContext(MapContext);
  // const sctx = React.useContext(SymbologyContext);
  // const ctx = mctx?.falcor ? mctx : sctx;
  const { state, setState } = React.useContext(SymbologyContext);

  const defaultValue =
    params.default !== null && params.default !== undefined
      ? params.default
      : params?.options?.[0]?.value;

  const curValue = useMemo(() => {
    return get(state, `${path}`, defaultValue);
  }, [state]);

  return (
    <label className="flex w-full">
      <div className="flex w-full items-center capitalize">
        <MultiLevelSelect
          searchable={params.searchable ? true : false}
          isMulti={true}
          placeholder={params.placeholder || "Select a value..."}
          options={params?.options}
          displayAccessor={(s) => s.name}
          // valueAccessor={(s) => s.value}
          value={curValue}
          onChange={(e) =>
            setState((draft) => {
              set(draft, `${path}`, e)
            })
          }
        />
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
  // const mctx = React.useContext(MapContext);
  // const sctx = React.useContext(SymbologyContext);
  // const ctx = mctx?.falcor ? mctx : sctx;
  const { state, setState } = React.useContext(SymbologyContext);
  const defaultValue =
    params.default !== null && params.default !== undefined
      ? params.default
      : params?.options?.[0]?.value;

  const curValue = useMemo(() => {
    return get(state, `${path}`, defaultValue);
  }, [state]);

  return (
    <label className='flex'>
      <div className='flex items-center'>
        <Switch
          checked={curValue}
          onChange={()=>{
            setState(draft=> {
              set(draft, `${path}`,!curValue)
            })
          }}
          className={`${
            curValue ? 'bg-blue-500' : 'bg-gray-200'
          } relative inline-flex h-4 w-8 items-center rounded-full `}
        >
          <span className="sr-only">{params.title}</span>
          <div
            className={`${
              curValue ? 'translate-x-5' : 'translate-x-0'
            } inline-block h-4 w-4  transform rounded-full bg-white transition border-[0.5] border-slate-600`}
          />
        </Switch>
      </div>
    </label>
  )
}

export const pluginControlTypes = {
  select: SelectControl,
  text: InputControl,
  radio: RadioControl,
  multiselect: MultiSelectControl,
  toggle: ToggleControl,
};
