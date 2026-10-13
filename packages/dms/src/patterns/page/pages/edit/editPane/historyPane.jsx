import React, {Fragment, useContext, useMemo, useState} from 'react'

import { ThemeContext, getComponentTheme } from '../../../../../ui/useTheme'
import { editPanesTheme } from './editPanes.theme'
import { CMSContext,PageContext } from '../../../context'
import {timeAgo} from '../../_utils'
import { updateHistory } from '../editFunctions'


function EditHistory () {
  const { theme: themeFromContext = {} } = React.useContext(ThemeContext) || {}
  const t = { ...editPanesTheme, ...getComponentTheme(themeFromContext, 'pages.editPanes') }
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

  if (t.historyWrap) return (
      <HistoryV3 t={t} history={historyEntries} onChange={value => updateHistory(item, value, user, apiUpdate)}/>
  )
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
            <div className="w-px bg-[var(--t-rule)]"/>
          </div>
          <>
            <div className="relative flex h-6 w-6 flex-none items-center justify-center bg-[var(--t-panel)]">
              <Icon icon={'Add'} width={10} height={10} className={'text-[var(--t-pencil)] hover:text-[var(--t-graphite)] cursor-pointer'} />
            </div>
            <input className="flex-auto py-0.5 text-xs leading-5 text-[var(--t-graphite)] rounded-md"
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
                      <div className="w-px bg-[var(--t-rule)]"/>
                    </div>
                    <div className="relative flex h-6 w-6 flex-none items-center justify-center bg-[var(--t-panel)]">
                      <div className="h-1.5 w-1.5 rounded-full bg-[var(--t-well)] ring-1 ring-[var(--t-rule-strong)]"/>
                    </div>
                    <div className={`${isComment ? 'border border-[var(--t-rule)] p-2 rounded-md' : ''} w-full`}>
                      <p className={`flex-auto py-0.5 text-xs leading-5 text-[var(--t-graphite)]`}>
                        <span className="font-medium text-[var(--t-ink)]">{historyItem.user}</span>
                        <span className={'ml-0.5'}>{isComment ? 'commented' : historyItem.action}</span>
                        <time dateTime={historyItem.time}
                              className={`float-right flex-none py-0.5 text-xs leading-5 text-[var(--t-graphite)]`}>
                          {timeAgo(historyItem.time)}
                        </time>
                        {isComment ? <span className={'block text-sm/6 text-[var(--t-graphite)]'}>{commentText}</span> : null}
                      </p>
                    </div>

                  </li>
              )
            })}
      </ul>


    </>
  )
 }

// History v3 (tessera v6, 2026-10-08): a real comment composer, an all / comments / publishes filter,
// entries grouped today / this week / earlier, publishes and comments drawn as milestones. Same
// entries and the same `commented: …` write as HistoryList.
const historyKind = (action = '') =>
  action.startsWith('commented:') ? 'comment'
    : /publish/i.test(action) ? 'publish'
    : /creat/i.test(action) ? 'create'
    : 'edit'

const dayBucket = (time) => {
  const d = new Date(time)
  if (isNaN(d)) return 'earlier'
  const now = new Date()
  if (d.toDateString() === now.toDateString()) return 'today'
  return (now - d) < 7 * 24 * 3600 * 1000 ? 'this week' : 'earlier'
}

function HistoryV3({ t, history, onChange }) {
  const { UI } = useContext(ThemeContext)
  const { Icon, ButtonSelect } = UI
  const [comment, setComment] = useState('')
  const [show, setShow] = useState('all')
  const entries = [...history]
    .sort((a, b) => new Date(b.time) - new Date(a.time))
    .map(h => ({ ...h, kind: historyKind(h.action) }))
    .filter(h => show === 'all' || (show === 'comments' ? h.kind === 'comment' : h.kind === 'publish'))
  const groups = ['today', 'this week', 'earlier']
    .map(label => ({ label, items: entries.filter(h => dayBucket(h.time) === label) }))
    .filter(g => g.items.length)
  const dot = (kind) => kind === 'comment' ? <span className={t.historyDotComment}><Icon icon='Text' className={t.historyDotIcon} /></span>
    : kind === 'publish' ? <span className={t.historyDotPublish}><Icon icon='Publish' className={t.historyDotIcon} /></span>
    : kind === 'create' ? <span className={t.historyDotCreate}><Icon icon='Plus' className={t.historyDotIcon} /></span>
    : <span className={t.historyDot} />
  const submit = () => { if (!comment.trim()) return; onChange(`commented: ${comment.trim()}`); setComment('') }

  return (
    <div className={t.historyWrap}>
      <div className={t.composer}>
        <textarea rows={2} className={t.composerInput} placeholder='Leave a note for other editors…' value={comment}
                  onChange={e => setComment(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) submit() }} />
        <div className={t.composerBar}>
          <span className={t.composerHint}>Shows in this page’s history</span>
          <button type='button' className={t.btnPrimary} disabled={!comment.trim()} onClick={submit}>Comment</button>
        </div>
      </div>
      <div className={t.historyFilter}>
        <ButtonSelect activeStyle='segmented' value={show} onChange={setShow}
                      options={[{ label: 'all', value: 'all' }, { label: 'comments', value: 'comments' }, { label: 'publishes', value: 'publishes' }]} />
      </div>
      {groups.length ? groups.map(g => (
        <div key={g.label}>
          <p className={t.historyDay}>{g.label}</p>
          <ul className={t.historyList}>
            <span className={t.historyLine} />
            {g.items.map((h, i) => {
              const who = typeof h.user === 'string' ? h.user : (h.user?.email || '')
              const text = h.kind === 'comment' ? h.action.slice('commented:'.length).trim() : null
              return (
                <li key={i} className={t.historyEntry}>
                  <span className={t.historyDotWrap}>{dot(h.kind)}</span>
                  <div className='flex-1 min-w-0'>
                    <p className={t.historyText}>
                      <b title={who} className={t.historyWho}>{who.split('@')[0] || 'someone'}</b> {h.kind === 'comment' ? 'commented' : h.action}
                      <span className={t.historyWhen}> · <time dateTime={h.time}>{timeAgo(h.time)}</time></span>
                    </p>
                    {text ? <p className={t.historyComment}>{text}</p> : null}
                  </div>
                </li>
              )
            })}
          </ul>
        </div>
      )) : <p className={t.historyEmpty}>{show === 'all' ? 'No history yet.' : `No ${show} yet.`}</p>}
    </div>
  )
}
