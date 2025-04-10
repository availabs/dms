import React, {Fragment} from 'react'
import { Popover, Transition, Button} from '@headlessui/react'
import { CMSContext } from '../../../siteConfig';
import {ArrowUp, InfoSquare} from '../../icons'

export const popoverTheme = {
    button: 'flex items-center cursor-pointer pt-1 pr-1',
    container: "absolute shadow-lg z-30 transform overflow-visible z-50 rounded-md"
}


const DefaultButton = (
    <InfoSquare className='text-blue-400 hover:text-blue-600  w-[24px] h-[24px]' title="Help Text"/>
)

const TriangleIcon = (props) => (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width={18} height={18} color={"#000000"} fill={"none"} {...props}>
        {/*<path d="M5.59347 9.22474C7.83881 5.62322 8.96148 3.82246 10.4326 3.28C11.445 2.90667 12.555 2.90667 13.5674 3.28C15.0385 3.82246 16.1612 5.62322 18.4065 9.22474C20.9338 13.2785 22.1975 15.3054 21.9749 16.9779C21.8222 18.125 21.2521 19.173 20.3762 19.9163C19.0993 21 16.7328 21 12 21C7.26716 21 4.90074 21 3.62378 19.9163C2.74792 19.173 2.17775 18.125 2.02509 16.9779C1.80252 15.3054 3.06617 13.2785 5.59347 9.22474Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />*/}
        <path d="M17.9998 15C17.9998 15 13.5809 9.00001 11.9998 9C10.4187 8.99999 5.99985 15 5.99985 15" stroke="currentColor" strokeWidth="1" strokeLinejoin="round" />

    </svg>
);

export default function PopoverComp ({ children, button=DefaultButton, onClick=()=>{}, anchor='bottom', width='max-w-sm lg:max-w-lg', ...props}) {
  const { theme = { popover: popoverTheme } } = React.useContext(CMSContext) || {}
    const bg = '#ffffff'
    const border = 'rgba(0,0,0,0.01)'
  return (
      <Popover className="relative">
          <Popover.Button className={theme?.popover?.button}>
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
                 <div className={'w-full flex items-center justify-center'}>
                     <TriangleIcon color={border} fill={bg}/>
                 </div>
                  <div className={'-mt-[7.52px] border rounded-md'} style={{backgroundColor: bg, borderColor: border}}>
                      {children}
                  </div>
              </Popover.Panel>
          </Transition>
      </Popover>

  )
}



