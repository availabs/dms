import React, {Fragment, useState} from 'react'
import { Dialog, Transition } from '@headlessui/react'

import { CMSContext } from '../../siteConfig'
import {timeAgo} from '../_utils'
import {Add} from "../../ui/icons";


export default function EditHistory ({item , dataItems, historyOpen, setHistoryOpen, onChange}) {
  const { baseUrl } = React.useContext(CMSContext) || {}

  return (
    <Transition.Root show={historyOpen} as={Fragment}>
      <Dialog as="div" className="relative z-30" onClose={setHistoryOpen}>
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
                  <div className="flex h-full flex-col overflow-y-auto bg-white py-6 shadow-xl">
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
                      <HistoryList history={item?.history || []} onChange={onChange}/>
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

 function HistoryList({history, onChange}) {
  const [comment, setComment] = useState('');
  return (
    <>
      <ul role="list" className="space-y-6">
        <li key='add-new' className={'relative flex gap-x-4'}>
          <div
              className={classNames(
                  history.length ? '-bottom-6' : 'h-6',
                  'absolute left-0 top-0 flex w-6 justify-center'
              )}
          >
            <div className="w-px bg-gray-200"/>
          </div>
          <>
            <div className="relative flex h-6 w-6 flex-none items-center justify-center bg-white">
              <Add width={10} height={10} className={'text-gray-400 hover:text-gray-500 cursor-pointer'} />
            </div>
            <input className="flex-auto py-0.5 text-xs leading-5 text-gray-500 rounded-md"
                   type={'text'}
                   placeholder={'add a comment'}
                   value={comment}
                   onChange={e => setComment(e.target.value)}
            />
            {
              comment?.length ? <button className={'p-1 rounded-md bg-blue-300 hover:bg-blue-600 text-white'} onClick={() => {
                onChange(`commented: ${comment}`)
                setComment('')
              }} >add</button> : null
            }
          </>
        </li>
        {history
            .sort((a, b) => new Date(b.time) - new Date(a.time))
            .map((historyItem, historyItemIdx) => {
              const isComment = historyItem.type.startsWith('commented:');
              const comment = isComment ? historyItem.type.split('commented:')[1] : null;
              return (
                  <li key={historyItem.id} className="relative flex gap-x-4">
                    <div
                        className={classNames(
                            historyItemIdx === history.length - 1 ? 'h-6' : '-bottom-6',
                            'absolute left-0 top-0 flex w-6 justify-center'
                        )}
                    >
                      <div className="w-px bg-gray-200"/>
                    </div>
                    <div className="relative flex h-6 w-6 flex-none items-center justify-center bg-white">
                      <div className="h-1.5 w-1.5 rounded-full bg-gray-100 ring-1 ring-gray-300"/>
                    </div>
                    <div className={`${isComment ? 'border p-2 rounded-md' : ''} w-full`}>
                      <p className={`flex-auto py-0.5 text-xs leading-5 text-gray-500`}>
                        <span className="font-medium text-gray-900">{historyItem.user}</span>
                        <span className={'ml-0.5'}>{isComment ? 'commented' : historyItem.type}</span>
                        <time dateTime={historyItem.time}
                              className={`float-right flex-none py-0.5 text-xs leading-5 text-gray-500`}>
                          {timeAgo(historyItem.time)}
                        </time>
                        {isComment ? <div className={'text-sm/6 text-gray-500'}>{comment}</div> : null}
                      </p>
                    </div>

                  </li>
              )
            })}
      </ul>


    </>
  )
 }


