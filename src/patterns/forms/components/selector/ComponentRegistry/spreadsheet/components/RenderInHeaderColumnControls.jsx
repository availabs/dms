import { Menu, MenuButton, MenuItem, MenuItems } from '@headlessui/react'
import RenderSwitch from "./Switch";
import {useRef} from "react";

export default function RenderInHeaderColumnControls({
    attribute, isEdit, orderBy, setOrderBy
                                            }) {
    const actions = [
        {
            label: 'Sort A->Z',
            action: () => setOrderBy({[attribute.name]: 'asc nulls last'})
        },
        {
            label: 'Sort Z->A',
            action: () => setOrderBy({[attribute.name]: 'desc nulls last'})
        }
    ]

    return (
        <Menu as="div" className="relative inline-block text-left">
            <div>
                <MenuButton
                    className="inline-flex items-center w-full justify-center gap-x-1.5 rounded-md px-3 py-2 text-sm font-semibold text-gray-900">
                    {attribute.display_name || attribute.name} {isEdit && <span className={'text-xs text-gray-500'}>v</span>}
                </MenuButton>
            </div>

            <MenuItems
                transition
                className="absolute left-0 z-10 w-72 origin-top-left divide-y divide-gray-100 rounded-md bg-white shadow-lg ring-1 ring-black ring-opacity-5 transition focus:outline-none data-[closed]:scale-95 data-[closed]:transform data-[closed]:opacity-0 data-[enter]:duration-100 data-[leave]:duration-75 data-[enter]:ease-out data-[leave]:ease-in"
            >
                <div className="py-1">
                    {
                        isEdit && actions
                            .map((action, i) => (
                            <MenuItem>
                                <div
                                    className="flex items-center cursor-pointer px-2 py-1 text-sm text-gray-700 data-[focus]:bg-gray-100 data-[focus]:text-gray-900"
                                    onClick={() => isEdit && action.action()}
                                >

                                    <div className={'flex justify-between m-1 w-full'}>
                                        {action.label}
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
