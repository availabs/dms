import React, { Fragment } from 'react'
import { Dialog, Transition } from '@headlessui/react'

import { CMSContext } from '../../siteConfig'



export default function EditHistory ({item , dataItems, historyOpen, setHistoryOpen}) {
  const { baseUrl } = React.useContext(CMSContext)

  return (
    <Transition.Root show={historyOpen} as={Fragment}>
      <Dialog as="div" className="relative z-20" onClose={setHistoryOpen}>
        <div className="fixed inset-0" />

        <div className="fixed inset-0 overflow-hidden">
          <div className="absolute inset-0 overflow-hidden">
            <div className="pointer-events-none fixed inset-y-0 right-0 flex max-w-full pl-10">
              <Transition.Child
                as={Fragment}
                enter="transform transition ease-in-out duration-500 sm:duration-700"
                enterFrom="translate-x-full"
                enterTo="translate-x-0"
                leave="transform transition ease-in-out duration-500 sm:duration-700"
                leaveFrom="translate-x-0"
                leaveTo="translate-x-full"
              >
                <Dialog.Panel className="pointer-events-auto w-screen max-w-md">
                  <div className="flex h-full flex-col overflow-y-scroll bg-white py-6 shadow-xl">
                    <div className="px-4 sm:px-6">
                      <div className="flex items-start justify-between">
                        <Dialog.Title className="text-base font-semibold leading-6 text-gray-900">
                          Edit History
                        </Dialog.Title>
                        <div className="ml-3 flex h-7 items-center">
                          <button
                            type="button"
                            className="relative rounded-md bg-white text-gray-400 hover:text-gray-500 focus:outline-none"
                            onClick={() => setHistoryOpen(false)}
                          >
                            <span className="absolute -inset-2.5" />
                            <span className="sr-only">Close panel</span>
                            <i className="h-6 w-6 text-lg fa fa-close" aria-hidden="true" />
                          </button>
                        </div>
                      </div>
                    </div>
                    <div className="relative mt-6 flex-1 px-4 sm:px-6">
                      <HistoryList history={item?.history || []} />
                    </div>
                  </div>
                </Dialog.Panel>
              </Transition.Child>
            </div>
          </div>
        </div>
      </Dialog>
    </Transition.Root>
  )
}



// --- examples --- //

function classNames(...classes) {
  return classes.filter(Boolean).join(' ')
}

 function HistoryList({history}) {
  
  return (
    <>
      <ul role="list" className="space-y-6">
        {history
          .sort((a,b) => new Date(b.time) - new Date(a.time))
          .map((historyItem, historyItemIdx) => (
          <li key={historyItem.id} className="relative flex gap-x-4">
            <div
              className={classNames(
                historyItemIdx === history.length - 1 ? 'h-6' : '-bottom-6',
                'absolute left-0 top-0 flex w-6 justify-center'
              )}
            >
              <div className="w-px bg-gray-200" />
            </div>
            {/*
              historyItem.type === 'commented' ? (
              <>
                <img
                  src={historyItem.person.imageUrl}
                  alt=""
                  className="relative mt-3 h-6 w-6 flex-none rounded-full bg-gray-50"
                />
                <div className="flex-auto rounded-md p-3 ring-1 ring-inset ring-gray-200">
                  <div className="flex justify-between gap-x-4">
                    <div className="py-0.5 text-xs leading-5 text-gray-500">
                      <span className="font-medium text-gray-900">{historyItem.time}</span> commented
                    </div>
                    <time dateTime={historyItem.dateTime} className="flex-none py-0.5 text-xs leading-5 text-gray-500">
                      {historyItem.date}
                    </time>
                  </div>
                  <p className="text-sm leading-6 text-gray-500">{historyItem.comment}</p>
                </div>
              </>
            ) : */ }
            
            <>
              <div className="relative flex h-6 w-6 flex-none items-center justify-center bg-white">
                  <div className="h-1.5 w-1.5 rounded-full bg-gray-100 ring-1 ring-gray-300" />
              </div>
              <p className="flex-auto py-0.5 text-xs leading-5 text-gray-500">
                <span className="font-medium text-gray-900">{historyItem.user}</span> {historyItem.type} 
              </p>
              <time dateTime={historyItem.time} className="flex-none py-0.5 text-xs leading-5 text-gray-500">
                {timeAgo(historyItem.time)}
              </time>
            </>
            
          </li>
        ))}
      </ul>

      
      
    </>
  )
}


function timeAgo(input) {
  const date = (input instanceof Date) ? input : new Date(input);
  const formatter = new Intl.RelativeTimeFormat('en');
  const ranges = {
    years: 3600 * 24 * 365,
    months: 3600 * 24 * 30,
    weeks: 3600 * 24 * 7,
    days: 3600 * 24,
    hours: 3600,
    minutes: 60,
    seconds: 1
  };
  const secondsElapsed = (date.getTime() - Date.now()) / 1000;
  for (let key in ranges) {
    if (ranges[key] < Math.abs(secondsElapsed)) {
      const delta = secondsElapsed / ranges[key];
      return formatter.format(Math.round(delta), key);
    }
  }
}