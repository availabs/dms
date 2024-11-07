import RenderSwitch from "./Switch";
import React, {useEffect, useRef, useState} from "react";
import {ArrowDown} from "../../../../ui/icons";

export default function RenderColumnControls({
    attributes, setAttributes, visibleAttributes, setVisibleAttributes, groupBy, fn, setFn
                                            }) {
    const dragItem = useRef();
    const dragOverItem = useRef();
    const menuRef = useRef(null);
    const [search, setSearch] = useState();
    const [isOpen, setIsOpen] = useState(false);
    const menuBtnId = 'menu-btn-column-controls'; // used to control isOpen on menu-btm click;
    // ================================================== group by updates start =======================================
    useEffect(() => {
        // when entering/exiting group by mode, columns need to have appropriate fns applied.

        if(!attributes.length) return; // attributes are not immediately available

        if(groupBy.length){
            // add fns
            const newFns = visibleAttributes
                .map(va => attributes.find(a => a.name === va))
                .filter(a => a && a.type !== 'calculated' && a.display !== 'calculated' && !groupBy.includes(a.name)) // calculated and grouped columns need not have fns
                .reduce((acc, a) => ({...acc, [a.name]: fn[a.name] || a.defaultFn || 'list'}) , {});

            setFn(newFns);
        }else if(!groupBy.length && Object.keys(fn).length){
            // remove fns
            setFn({});
        }
    }, [attributes, visibleAttributes, groupBy]);
    // ================================================== group by updates end =========================================

    // ================================================== drag utils start =============================================
    const dragStart = (e, position) => {
        dragItem.current = position;
        e.dataTransfer.effectAllowed = "move";
    };

    const dragEnter = (e, position) => {
        dragOverItem.current = position;
    };
    const dragOver = (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
    };

    const drop = (e) => {
        const copyListItems =
            [
                ...visibleAttributes.map(va => attributes.find(attr => attr.name === va)),
                ...attributes.filter(attr => !visibleAttributes.includes(attr.name))
            ];
        const dragItemContent = copyListItems[dragItem.current];
        copyListItems.splice(dragItem.current, 1);
        copyListItems.splice(dragOverItem.current, 0, dragItemContent);
        dragItem.current = null;
        dragOverItem.current = null;
        setAttributes(copyListItems);
        setVisibleAttributes(copyListItems.filter(attr => visibleAttributes.includes(attr.name)).map(attr => attr.name))
    };
    // ================================================== drag utils end ===============================================

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
    return (
        <div className="relative inline-block text-left">
            <div>
                <div id={menuBtnId}
                     className={`inline-flex w-full justify-center items-center rounded-md px-1.5 py-1 text-sm font-regular text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 ${isOpen ? `bg-gray-50` : `bg-white hover:bg-gray-50`} cursor-pointer`}
                     onClick={e => setIsOpen(!isOpen)}>
                    Columns <ArrowDown height={18} width={18} className={'mt-1'}/>
                </div>
            </div>

            <div ref={menuRef}
                className={`${isOpen ? 'visible transition ease-in duration-200' : 'hidden transition ease-in duration-200'} absolute left-0 z-10 w-96 origin-top-left divide-y divide-gray-100 rounded-md bg-white shadow-lg ring-1 ring-black ring-opacity-5 transition focus:outline-none`}
            >
                <input className={'px-4 py-1 w-full rounded-md'} placeholder={'search...'}
                       onChange={e => {
                           setSearch(e.target.value)
                       }}/>
                <div className="py-1 max-h-[500px] overflow-auto scrollbar-sm">
                    {
                        attributes
                            .filter(a => a && (!search || (a.display_name || a.name).toLowerCase().includes(search.toLowerCase())))
                            .map((attribute, i) => (
                                <div
                                    className="flex items-center px-2 py-1 text-sm text-gray-700 hover:bg-gray-100 hover:text-gray-900"
                                    onDragStart={(e) => dragStart(e, i)}
                                    onDragEnter={(e) => dragEnter(e, i)}

                                    onDragOver={dragOver}

                                    onDragEnd={drop}
                                    draggable
                                >
                                    <div className={'h-4 w-4 m-1 text-gray-800'}>
                                        <svg data-v-4e778f45=""
                                             className="nc-icon cursor-move !h-3.75 text-gray-600 mr-1"
                                             viewBox="0 0 24 24" width="1.2em" height="1.2em">
                                            <path fill="currentColor"
                                                  d="M8.5 7a1.5 1.5 0 1 0 0-3a1.5 1.5 0 0 0 0 3m0 6.5a1.5 1.5 0 1 0 0-3a1.5 1.5 0 0 0 0 3m1.5 5a1.5 1.5 0 1 1-3 0a1.5 1.5 0 0 1 3 0M15.5 7a1.5 1.5 0 1 0 0-3a1.5 1.5 0 0 0 0 3m1.5 5a1.5 1.5 0 1 1-3 0a1.5 1.5 0 0 1 3 0m-1.5 8a1.5 1.5 0 1 0 0-3a1.5 1.5 0 0 0 0 3"></path>
                                        </svg>
                                    </div>

                                    <div className={'grid grid-cols-3 m-1 w-full cursor-pointer'}
                                         style={{gridTemplateColumns: '2fr 1fr 1fr'}}
                                         // onClick={() => !visibleAttributes.includes(attribute.name) ?
                                         //     setVisibleAttributes([...visibleAttributes, attribute.name]) :
                                         //     setVisibleAttributes(visibleAttributes.filter(attr => attr !== attribute.name))}
                                    >
                                        <label className={'place-self-stretch'}>{attribute.display_name || attribute.name}</label>

                                        <select
                                            className={groupBy?.includes(attribute.name) || !visibleAttributes.includes(attribute.name) ? 'invisible' : 'p-0.5 rounded-md bg-white border h-fit'}
                                            value={fn[attribute.name]}
                                            onClick={e => setFn({...fn, [attribute.name]: e.target.value})}
                                        >
                                            {
                                                    ['none', 'list', 'sum', 'count']
                                                        .map(fnOption => <option key={fnOption} value={fnOption}>{fnOption}</option> )
                                            }
                                        </select>
                                        <div className={'justify-self-end'}>
                                            <RenderSwitch
                                                id={attribute.name}
                                                enabled={visibleAttributes.includes(attribute.name)}
                                                setEnabled={(value) => value ? setVisibleAttributes([...visibleAttributes, attribute.name]) :
                                                    setVisibleAttributes(visibleAttributes.filter(attr => attr !== attribute.name))}
                                            />
                                        </div>
                                    </div>
                                </div>
                        ))
                    }
                </div>
            </div>
        </div>
    )
}
