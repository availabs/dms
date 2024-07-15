import { Menu, MenuButton, MenuItem, MenuItems } from '@headlessui/react'
import RenderSwitch from "./Switch";
import {useRef} from "react";
import {ArrowDown, ChevronDownSquare} from "../../../../../../admin/ui/icons";

export default function RenderColumnControls({
    tableType, setTableType
                                            }) {
    return (
        <Menu as="div" className="relative inline-block text-left">
            <div>
                <MenuButton className="inline-flex w-full justify-center gap-x-1.5 rounded-md bg-white px-3 py-2 text-sm font-semibold text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 hover:bg-gray-50">
                    Type <ArrowDown />
                </MenuButton>
            </div>

            <MenuItems
                transition
                className="absolute left-0 z-10 w-72 origin-top-left divide-y divide-gray-100 rounded-md bg-white shadow-lg ring-1 ring-black ring-opacity-5 transition focus:outline-none data-[closed]:scale-95 data-[closed]:transform data-[closed]:opacity-0 data-[enter]:duration-100 data-[leave]:duration-75 data-[enter]:ease-out data-[leave]:ease-in"
            >
                <div className="py-1">
                    {
                        [
                            'simple', 'glide'
                        ]
                            .map((type, i) => (
                            <MenuItem>
                                <div
                                    className={`flex items-center cursor-pointer px-2 py-1 text-sm text-gray-700 data-[focus]:bg-gray-100 data-[focus]:text-gray-900 ${type === tableType ? `font-semibold text-gray-900 bg-gray-50` : ``}`}
                                    onClick={e => setTableType(type)}
                                >
                                    <div className={`flex justify-between m-1 w-full py-1`}>
                                        {type}
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
