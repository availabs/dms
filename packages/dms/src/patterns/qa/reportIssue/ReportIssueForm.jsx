import React from 'react'
import { ThemeContext, getComponentTheme } from '../../../ui/useTheme'
import { applyCreateDefaults } from '../../page/components/sections/components/dataWrapper/getData'
import {
  REPORT_KINDS, REPORT_SEVERITIES, DEFAULT_REPORT_SEVERITY, REPORT_DEFAULTS,
  reportRow, ticketsFormat, ticketsSource,
} from './report'
import { reportIssueTheme } from './ReportIssue.theme'

const labelsByValue = (options) => Object.fromEntries(options.map((o) => [o.value, o.label]))
const KIND_LABELS = labelsByValue(REPORT_KINDS)
const SEVERITY_LABELS = labelsByValue(REPORT_SEVERITIES)

// The Report an issue form (opened by ./ReportIssue.jsx): a small modal built from the shared UI parts,
// so it takes the host theme's look. It creates one row in the covering install's tickets dataset (`tickets`), with
// the create-time fills Page QA's New ticket form uses (number, status, reporter, dates).
export default function ReportIssueForm({ open, setOpen, tickets, site, page, app, user, apiLoad, apiUpdate }) {
  const { UI, theme: themeFromContext = {} } = React.useContext(ThemeContext) || {}
  const t = { ...reportIssueTheme, ...getComponentTheme(themeFromContext, 'qaReportIssue') }
  const { Modal, FieldSet, Select, Button } = UI

  const [kind, setKind] = React.useState('problem')
  const [severity, setSeverity] = React.useState(DEFAULT_REPORT_SEVERITY)
  const [title, setTitle] = React.useState('')
  const [description, setDescription] = React.useState('')
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState('')
  const [sent, setSent] = React.useState(false)

  const canSend = !!title.trim() && !!description.trim() && !busy && !!apiUpdate

  const send = async () => {
    if (!canSend) return
    setBusy(true)
    setError('')
    try {
      const env = {
        url: window.location.href,
        browser: navigator.userAgent,
        window: `${window.innerWidth}×${window.innerHeight}`,
      }
      const data = await applyCreateDefaults({
        columns: REPORT_DEFAULTS,
        newItem: reportRow({ kind, severity, title, description, site, page, env }),
        apiLoad,
        externalSource: ticketsSource(app, tickets),
        user,
      })
      const res = await apiUpdate({ data, config: { format: ticketsFormat(app, tickets) } })
      if (res?.error) throw new Error(res.error)
      setSent(true)
    } catch (e) {
      setError(e?.message || 'The report could not be sent. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  const fields = [
    { label: 'What is it?', type: Select, value: kind, onChange: setKind, options: REPORT_KINDS, meta: KIND_LABELS },
    ...(kind === 'problem'
      ? [{ label: 'How much does it get in the way?', type: Select, value: severity, onChange: setSeverity, options: REPORT_SEVERITIES, meta: SEVERITY_LABELS }]
      : []),
    { label: 'Short summary', type: 'Input', value: title, onChange: (e) => setTitle(e.target.value), placeholder: 'What is it, in a few words?' },
    {
      label: kind === 'idea' ? 'What would help?' : 'What happened?',
      type: 'Textarea', rows: 4, value: description, onChange: (e) => setDescription(e.target.value),
      placeholder: kind === 'idea' ? 'What would you like the page to do?' : 'What did you see? What did you expect?',
    },
  ]

  return (
    <Modal open={open} setOpen={setOpen}>
      {sent ? (
        <div className={t.form}>
          <div className={t.header}>
            <div className={t.title}>Report sent</div>
            <div className={t.sentText}>Thanks for taking the time. The team that looks after this site will see it.</div>
          </div>
          <div className={t.actions}>
            <Button activeStyle={t.sendStyle} onClick={() => setOpen(false)}>Close</Button>
          </div>
        </div>
      ) : (
        <div className={t.form}>
          <div className={t.header}>
            <div className={t.title}>Report an issue</div>
            <div className={t.subtitle}>on {page?.title || page?.url_slug || 'this page'}</div>
          </div>
          <FieldSet components={fields} />
          <div className={t.note}>Sent with your report: this page's address and your browser details.</div>
          {error ? <div className={t.error}>{error}</div> : null}
          <div className={t.actions}>
            <Button activeStyle={t.cancelStyle} onClick={() => setOpen(false)}>Cancel</Button>
            <Button activeStyle={t.sendStyle} onClick={send} disabled={!canSend}>
              {busy ? 'Sending…' : 'Send report'}
            </Button>
          </div>
        </div>
      )}
    </Modal>
  )
}
