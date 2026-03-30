import React, {Fragment, useContext, useMemo, useState} from 'react'

import { ThemeContext } from '../../../../../ui/useTheme'
import { CMSContext,PageContext } from '../../../context'
import {timeAgo} from '../../_utils'
import { updateHistory } from '../editFunctions'


function EditHistory () {
  const { baseUrl, user  } = React.useContext(CMSContext) || {}
  const { item, dataItems, apiUpdate } =  React.useContext(PageContext) || {}

  // Backward-compat: handle both old (array of refs) and new (single ref with entries) formats
  const historyEntries = useMemo(() => {
    if (import.meta.env.DEV) {
      console.log('[historyPane] item.history:', JSON.stringify(item?.history, null, 2)?.slice(0, 500))
    }
    if (Array.isArray(item?.history)) {
      // Old format: array of resolved refs, each with .type, .user, .time
      return item.history.map(h => ({ action: h.type, user: h.user, time: h.time }))
    }
    // New format: single ref with .entries array
    if (Array.isArray(item?.history?.entries)) {
      return item.history.entries
    }
    return []
  }, [item?.history])

  return (
      <div className="w-full overflow-y-auto">
        <HistoryList history={historyEntries} onChange={value => updateHistory(item, value, user, apiUpdate)}/>
      </div>
  )
}

export default EditHistory

// --- examples --- //

function classNames(...classes) {
  return classes.filter(Boolean).join(' ')
}

function HistoryList({history, onChange}) {
    const {UI} = useContext(ThemeContext);
    const {Icon} = UI;
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
              <Icon icon={'Add'} width={10} height={10} className={'text-gray-400 hover:text-gray-500 cursor-pointer'} />
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
        {[...history]
            .sort((a, b) => new Date(b.time) - new Date(a.time))
            .map((historyItem, historyItemIdx) => {
              const isComment = historyItem.action?.startsWith('commented:');
              const commentText = isComment ? historyItem.action.split('commented:')[1] : null;
              return (
                  <li key={historyItemIdx} className="relative flex gap-x-4">
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
                        <span className={'ml-0.5'}>{isComment ? 'commented' : historyItem.action}</span>
                        <time dateTime={historyItem.time}
                              className={`float-right flex-none py-0.5 text-xs leading-5 text-gray-500`}>
                          {timeAgo(historyItem.time)}
                        </time>
                        {isComment ? <span className={'block text-sm/6 text-gray-500'}>{commentText}</span> : null}
                      </p>
                    </div>

                  </li>
              )
            })}
      </ul>


    </>
  )
 }
