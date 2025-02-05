import React, {Fragment} from 'react'
import { Button } from '@headlessui/react'
import { Popover, Transition } from '@headlessui/react'
import { CMSContext } from '../../../siteConfig';
import { InfoSquare } from '../../icons'

export const popoverTheme = {
  button: 'flex items-center cursor-pointer pt-1 pr-1',
  container: "absolute shadow-lg bg-white z-30 transform px-4 border border-blue-200 "

}


const DefaultButton = (
    <InfoSquare className='text-blue-400 hover:text-blue-600  w-[24px] h-[24px]'title="Help Text"/>
)

export default function PopoverComp ({ children, button=DefaultButton, onClick=()=>{}, anchor='bottom', width='max-w-sm lg:max-w-lg', ...props}) {
  const { theme = { popover: popoverTheme } } = React.useContext(CMSContext) || {}
  return (
   <Popover className="relative">
        <Popover.Button className={theme?.popover?.button }>
            {button}
        </Popover.Button>
        <Transition
            as={Fragment}
            enter="transition ease-out duration-200"
            enterFrom="opacity-0 translate-y-1"
            enterTo="opacity-100 translate-y-0"
            leave="transition ease-in duration-150"
            leaveFrom="opacity-100 translate-y-0"
            leaveTo="opacity-0 translate-y-1"
        >
            <Popover.Panel
                anchor="bottom"
                className={`${theme?.popover?.container} ${width}`}
            >
                {children}
            </Popover.Panel>
        </Transition>
    </Popover>
  )
}



