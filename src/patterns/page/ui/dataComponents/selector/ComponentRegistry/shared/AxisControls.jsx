import React, {useRef, useState} from "react";
import {ArrowDown} from "../../../../../../forms/ui/icons";
import {cloneDeep} from "lodash-es";
import RenderSwitch from "../../dataWrapper/components/Switch";
import { format as d3format } from "d3-format"
import dataTypes from "../../../../../../../data-types";
const illionsFormat = d3format(".2r")
const getIllionsFormat = (divisor, suffix) => d => {
    return `${ illionsFormat(d / divisor) }${ suffix }`;
}
export const TickFormatOptionsMap = {
    "Integer": ",d",
    "Fixed Point - 2 deciamls": ",.2f",
    "Fixed Point - 1 deciaml": ",.1f",
    "SI-suffix - 3 significant digits": ".3s",
    "SI-suffix - 2 significant digits": ".2s",
    "Millions": getIllionsFormat(1000000, "m"),
    "Billions": getIllionsFormat(1000000000, "bn"),
    "Trillions": getIllionsFormat(1000000000000, "tr")
}
// renders controls based on props passed. if any setters are not passed for a controller, it's not rendered.
export const AxisControls = ({
    multiselect,
    axis='x', // x, y: controls sort/agg options
    attributes,
    label, setLabel,
    column, setColumn,
    categorizeColumn, setCategorizeColumn,
    sort, setSort, // X Axis
    fn, setFn, // Y Axis
    tickSpacing, setTickSpacing,
    tickFormat, setTickFormat,
    showGridLines, setShowGridLines,
    rotateLabels, setRotateLabels
   }) => {
    const menuRef = useRef(null);
    const [isOpen, setIsOpen] = useState(false);
    const menuBtnId = 'menu-btn-axis-controls'; // used to control isOpen on menu-btm click;

    // ================================================== close on outside click start =================================
    const handleClickOutside = (e) => {
        if (menuRef.current && !menuRef.current.contains(e.target) && e.target.id !== menuBtnId) {
            setIsOpen(false);
        }
    };

    React.useEffect(() => {
        document.addEventListener('mousedown', handleClickOutside);
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, []);
    // ================================================== close on outside click end ===================================
    const gridTemplateColumns = '0.5fr auto';
    const Multiselect = dataTypes.multiselect.EditComp;

    return (
        <div className="relative inline-block text-left">
            <div>
                <div id={menuBtnId}
                     className={`capitalize inline-flex w-full justify-center items-center rounded-md px-1.5 py-1 text-sm font-regular 
                     text-gray-900 shadow-sm ring-1 ring-inset ${column ? `ring-blue-300` : `ring-gray-300`} 
                     ${isOpen ? `bg-gray-50` : `bg-white hover:bg-gray-50`} cursor-pointer`}
                     onClick={e => setIsOpen(!isOpen)}>
                    {axis} Axis <ArrowDown height={18} width={18} className={'mt-1'}/>
                </div>
            </div>

            <div ref={menuRef}
                 className={`${isOpen ? 'visible transition ease-in duration-200' : 'hidden transition ease-in duration-200'} absolute left-0 z-10 w-[35rem] origin-top-left divide-y divide-gray-100 rounded-md bg-white shadow-lg ring-1 ring-black ring-opacity-5 transition focus:outline-none`}
            >
                <div className="py-1 max-h-[500px] overflow-auto scrollbar-sm">
                    <div className="flex items-center px-2 py-1 text-xs text-gray-700 hover:bg-gray-100 hover:text-gray-900">
                        <div className={'h-4 w-4 m-1 text-gray-800'}>
                            <svg data-v-4e778f45=""
                                 className="nc-icon cursor-move !h-3.75 text-gray-600 mr-1"
                                 viewBox="0 0 24 24" width="1.2em" height="1.2em">
                                <path fill="currentColor"
                                      d="M8.5 7a1.5 1.5 0 1 0 0-3a1.5 1.5 0 0 0 0 3m0 6.5a1.5 1.5 0 1 0 0-3a1.5 1.5 0 0 0 0 3m1.5 5a1.5 1.5 0 1 1-3 0a1.5 1.5 0 0 1 3 0M15.5 7a1.5 1.5 0 1 0 0-3a1.5 1.5 0 0 0 0 3m1.5 5a1.5 1.5 0 1 1-3 0a1.5 1.5 0 0 1 3 0m-1.5 8a1.5 1.5 0 1 0 0-3a1.5 1.5 0 0 0 0 3"></path>
                            </svg>
                        </div>

                        <div className={'grid grid-cols-2 gap-0.5 m-1 w-full cursor-pointer'} style={{gridTemplateColumns}}>
                            {
                                setLabel ?
                                    <>
                                        <label>Label</label>
                                        <input className={'place-self-stretch'}
                                               value={label}
                                               onChange={e => setLabel(e.target.value)}
                                        />
                                    </> : null
                            }

                            {
                                setColumn ?
                                    <>
                                        <label>Column</label>
                                        {
                                            multiselect ? (
                                                <Multiselect
                                                    value={column}
                                                />
                                            ) : (
                                                <select
                                                    value={column}
                                                    onChange={e => setColumn(e.target.value)}
                                                >
                                                    {attributes.map(({name, display_name}) => <option key={name}
                                                                                                      value={name}>{display_name || name}</option>)}
                                                </select>
                                            )
                                        }
                                    </> : null
                            }

                            {
                                setSort ?
                                    <>
                                        <label>Sort</label>
                                        <select
                                            value={sort}
                                            onChange={e => setSort(e.target.value)}
                                        >
                                            {[
                                                {value: undefined, label: 'None'},
                                                {value: 'asc', label: 'Ascending'},
                                                {value: 'desc', label: 'Descending'}
                                            ].map(({value, label}) => <option key={value} value={value}>{label}</option>)}
                                        </select>
                                    </> : null
                            }

                            {
                                setFn ?
                                    <>
                                        <label>Aggregate</label>
                                        <select
                                            value={fn}
                                            onChange={e => setFn(e.target.value)}
                                        >
                                            {[
                                                {value: 'sum', label: 'Sum'},
                                                {value: 'avg', label: 'Average'},
                                                {value: 'count', label: 'Count'}
                                            ].map(({value, label}) => <option key={value} value={value}>{label}</option>)}
                                        </select>
                                    </> : null
                            }

                            {
                                setCategorizeColumn ?
                                    <>
                                        <label>Categorize by</label>
                                        <select
                                            value={categorizeColumn}
                                            onChange={e => setCategorizeColumn(e.target.value)}
                                        >
                                            {attributes.filter(({name}) => name !== column).map(({name, display_name}) => <option key={name} value={name}>{display_name || name}</option>)}
                                        </select>
                                    </> : null
                            }

                            {
                                setTickSpacing ?
                                    <>
                                        <label>Tick Spacing</label>
                                        <input type={'number'} onWheel={() => {}}
                                            value={tickSpacing}
                                            onChange={e => setTickSpacing(e.target.value)}
                                        />
                                    </> : null
                            }

                            {
                                setTickFormat ?
                                    <>
                                        <label>Tick Format</label>
                                        <select
                                            value={tickFormat}
                                            onChange={e => setTickFormat(e.target.value)}
                                        >
                                            {Object.keys(TickFormatOptionsMap)
                                                .map((value) => <option key={value} value={value}>{value}</option>)}
                                        </select>
                                    </> : null
                            }

                            {
                                setShowGridLines ?
                                    <>
                                        <label>Show Gridlines</label>
                                        <div className={'justify-self-end'}>
                                            <RenderSwitch
                                                size={'small'}
                                                id={`show-grid-lines-${axis}`}
                                                enabled={showGridLines}
                                                setEnabled={setShowGridLines}
                                            />
                                        </div>
                                    </> : null
                            }

                            {
                                setRotateLabels ?
                                    <>
                                        <label>Rotate Labels</label>
                                        <div className={'justify-self-end'}>
                                            <RenderSwitch
                                                size={'small'}
                                                id={`show-grid-lines-${axis}`}
                                                enabled={rotateLabels}
                                                setEnabled={setRotateLabels}
                                            />
                                        </div>
                                    </> : null
                            }
                        </div>
                    </div>
                </div>
            </div>
        </div>
    )
}