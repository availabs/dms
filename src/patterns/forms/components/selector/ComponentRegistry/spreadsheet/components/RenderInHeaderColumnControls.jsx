import { Menu, MenuButton, MenuItem, MenuItems } from '@headlessui/react'
import RenderSwitch from "./Switch";
import {useRef} from "react";
import {ArrowDown, SortAsc, SortDesc} from "../../../../../../admin/ui/icons";

export default function RenderInHeaderColumnControls({
    attribute, isEdit, orderBy, setOrderBy
                                            }) {
    const actions = [
        {
            label: 'Sort A->Z',
            action: () => setOrderBy({[attribute.name]: 'asc nulls last', id: 'asc'})
        },
        {
            label: 'Sort Z->A',
            action: () => setOrderBy({[attribute.name]: 'desc nulls last', id: 'desc'})
        },
        {
            label: 'Clear Sort',
            action: () => setOrderBy({})
        }
    ]

    return (
        <Menu as="div" className="relative inline-block text-left w-full">
            <div>
                <MenuButton
                    className="inline-flex items-center w-full justify-between gap-x-1.5 rounded-md px-3 py-1 text-sm font-semibold text-gray-900">
                    {attribute.display_name || attribute.name}
                    <div id={'col-icons'} className={'flex items-center'}>
                        {orderBy[attribute.name] === 'asc nulls last' ? <SortAsc /> :
                            orderBy[attribute.name] === 'desc nulls last' ? <SortDesc /> : null}
                        {isEdit && <ArrowDown />}
                    </div>
                </MenuButton>
            </div>

            <MenuItems
                transition
                className="absolute right-0 z-10 w-72 origin-top-left divide-y divide-gray-100 rounded-md bg-white shadow-lg ring-1 ring-black ring-opacity-5 transition focus:outline-none data-[closed]:scale-95 data-[closed]:transform data-[closed]:opacity-0 data-[enter]:duration-100 data-[leave]:duration-75 data-[enter]:ease-out data-[leave]:ease-in"
            >
                <div className="py-1 h-1/2 overflow-auto scrollbar-sm">
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
