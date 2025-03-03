import React, {Fragment, useState, useEffect} from 'react'
import { Dialog, Transition } from '@headlessui/react'
import { XMark } from '../../icons'
import { CMSContext } from '../../../siteConfig';

// TO DO - theme this comp

// export default function Drawer ({ open, setOpen, CloseIcon=XMark, width='max-w-64', children, closeOnClick=true }) {
  
//   return (
//     <Transition.Root show={open} as={Fragment}>
//       <Dialog as="div" className="relative z-30" onClose={ closeOnClick ? setOpen : () => {} }>
        
//         {/*<div className="fixed inset-0 overflow-hidden">
//           <div className="absolute inset-0 overflow-hidden">*/}
//             <div className=" fixed inset-y-0 right-0 flex max-w-[400px] pointer-events-none">
//               <Transition.Child
//                 as={Fragment}
//                 enter="transform transition ease-in-out duration-500 sm:duration-700"
//                 enterFrom="translate-x-full"
//                 enterTo="translate-x-0"
//                 leave="transform transition ease-in-out duration-500 sm:duration-700"
//                 leaveFrom="translate-x-0"
//                 leaveTo="translate-x-full"
//               >
//                 <Dialog.Panel className={`pointer-events-auto ${width} bg-white shadow-lg`}>
//                   <div className="">
//                     <div className="fixed right-2 top-2">
//                       <button
//                         type="button"
//                         className="relative rounded-md bg-white text-gray-400 hover:text-gray-500 focus:outline-none"
//                         onClick={() => setOpen(false)}
//                       >
//                         <span className="absolute -inset-2.5" />
//                         <span className="sr-only">Close panel</span>
//                         <CloseIcon className="size-6" aria-hidden="true" />
//                       </button>
//                     </div>
//                   </div>
//                   {children}
//                 </Dialog.Panel>
//               </Transition.Child>
//             </div>
//         {/*  </div>
//         </div>*/}
//       </Dialog>
//     </Transition.Root>
//   )
// }

export default function Drawer ({ open, setOpen, CloseIcon=XMark, width='max-w-64', children, closeOnClick=true }) {
  
  return (
    <Transition.Root  as={Fragment} show={open}>
      <Transition.Child
        as={Fragment}
        enter="transform transition ease-in-out duration-500 sm:duration-700"
        enterFrom="translate-x-full"
        enterTo="translate-x-0"
        leave="transform transition ease-in-out duration-500 sm:duration-700"
        leaveFrom="translate-x-0"
        leaveTo="translate-x-full"
      >
        <div className={`${open ? 'fixed' : 'hidden'} findmeclass right-0 top-0 bottom-0 z-50 ${width} translate-x-0 bg-white shadow-lg `}>
          <div className="">
            <div className="fixed right-2 top-2">
              <button
                type="button"
                className="relative rounded-md bg-white text-gray-400 hover:text-gray-500 focus:outline-none"
                onClick={() => setOpen(false)}
              >
                <span className="absolute -inset-2.5" />
                <span className="sr-only">Close panel</span>
                <CloseIcon className="size-6" aria-hidden="true" />
              </button>
            </div>
          </div>
          {children}
        </div>
      </Transition.Child>
    </Transition.Root>
  )
}