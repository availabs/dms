import React, {Fragment, useState} from 'react'


import { CMSContext } from '../../../siteConfig'
import {timeAgo} from '../../_utils'
import {Add} from "../../../ui/icons";
import { updateHistory } from '../editFunctions'
import { PageContext } from '../../view'


function EditHistory () {
  const { baseUrl, user  } = React.useContext(CMSContext) || {}
  const { item, dataItems, apiUpdate } =  React.useContext(PageContext) || {}

  console.log('edit History', item)

  return (
    <div className="flex h-full flex-col">
      <div className="px-4 sm:px-6 py-2">
        <div className="flex items-start justify-between">
          <h1 className="text-base font-semibold leading-6 text-gray-900">
            History
          </h1>
        </div>
      </div>
      <div className="relative flex-1 px-4 sm:px-6 w-full max-h-[calc(100vh_-_135px)] overflow-y-auto">
        <HistoryList history={item?.history || []} onChange={value => updateHistory(item, value, user, apiUpdate)}/>
      </div>
    </div>          
  )
}

export default EditHistory

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


