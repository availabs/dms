import { Menu, MenuButton, MenuItem, MenuItems } from '@headlessui/react'
import RenderSwitch from "./Switch";
import {useRef} from "react";
import {ArrowDown, ChevronDownSquare} from "../../../../../../admin/ui/icons";

export default function RenderColumnControls({
                                                 attributes, filters, setFilters
                                             }) {
    return (
        <Menu as="div" className="relative inline-block text-left">
            <div>
                <MenuButton className="inline-flex w-full justify-center gap-x-1.5 rounded-md bg-white px-3 py-2 text-sm font-semibold text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 hover:bg-gray-50">
                    Filters <ArrowDown />
                </MenuButton>
            </div>

            <MenuItems
                transition
                className="absolute left-0 z-10 w-72 origin-top-left divide-y divide-gray-100 rounded-md bg-white shadow-lg ring-1 ring-black ring-opacity-5 transition focus:outline-none data-[closed]:scale-95 data-[closed]:transform data-[closed]:opacity-0 data-[enter]:duration-100 data-[leave]:duration-75 data-[enter]:ease-out data-[leave]:ease-in"
            >
                <div className="py-1 h-[500px] overflow-auto scrollbar-sm">
                    {
                        attributes.map((attribute, i) => (
                                <MenuItem>
                                    <div
                                        className="flex items-center cursor-pointer px-2 py-1 text-sm text-gray-700 data-[focus]:bg-gray-100 data-[focus]:text-gray-900"
                                    >
                                        <div className={'h-4 w-4 m-1 cursor-pointer text-gray-800'}>
                                            <svg data-v-4e778f45=""
                                                 className="nc-icon cursor-move !h-3.75 text-gray-600 mr-1"
                                                 viewBox="0 0 24 24" width="1.2em" height="1.2em">
                                                <path fill="currentColor"
                                                      d="M8.5 7a1.5 1.5 0 1 0 0-3a1.5 1.5 0 0 0 0 3m0 6.5a1.5 1.5 0 1 0 0-3a1.5 1.5 0 0 0 0 3m1.5 5a1.5 1.5 0 1 1-3 0a1.5 1.5 0 0 1 3 0M15.5 7a1.5 1.5 0 1 0 0-3a1.5 1.5 0 0 0 0 3m1.5 5a1.5 1.5 0 1 1-3 0a1.5 1.5 0 0 1 3 0m-1.5 8a1.5 1.5 0 1 0 0-3a1.5 1.5 0 0 0 0 3"></path>
                                            </svg>
                                        </div>

                                        <div className={'flex justify-between m-1 w-full'}>
                                            {attribute.display_name || attribute.name}

                                            <RenderSwitch
                                                enabled={filters.find(f => f.column === attribute.name) ? true : false}
                                                setEnabled={e => e ?
                                                    setFilters([...filters, {column: attribute.name}]) :
                                                    setFilters(filters.filter(attr => attr.column !== attribute.name))}
                                            />
                                        </div>
                                    </div>
                                </MenuItem>
                            ))
                    }
                </div>
            </MenuItems>
        </Menu>
    )
}
