import React from 'react'
import { CMSContext, PageContext } from '../../page/context'
import { AuthContext } from '../../auth/context'
import { ThemeContext, getComponentTheme } from '../../../ui/useTheme'
import { lazyComponent } from '../../../utils/lazyComponent'
import { datasetRows } from '../datasets'
import { COVERED_SITE_COLUMNS } from '../tracking'
import { findCoveringSite } from './report'
import { reportIssueTheme } from './ReportIssue.theme'

// The form is its own chunk: every page with the widget in its nav carries only this button.
const ReportIssueForm = lazyComponent('qa/ReportIssueForm', () => import('./ReportIssueForm'))

// Each install's covered-sites rows, read once per page load and shared by every page and nav slot that
// shows the widget. A Configure save shows on the next load.
const coveredSitesByInstall = new Map()

// The "Report an issue" nav widget (registered in ../siteConfig.jsx). A theme places it in any nav slot:
// { type: 'ReportIssue', options: { iconOnly, icon, label, activeStyle } } (iconOnly and the style default
// to the theme's `qaReportIssue`). It shows only to a signed-in
// user on a page a QA install covers, and files into that install's tickets, whether or not the user is
// granted on the install (the server's stub for an install carries its intake refs). Signed-out filing
// is deferred (qa-pattern-type.md, "Phases 6–7"). Renders nothing until coverage is known, so the server
// render and the first client render match.
export default function ReportIssue({ label = 'Report an issue', icon = 'Alert', iconOnly, activeStyle }) {
  const { UI, theme: themeFromContext = {} } = React.useContext(ThemeContext) || {}
  const t = { ...reportIssueTheme, ...getComponentTheme(themeFromContext, 'qaReportIssue') }
  // The signed-in user from AuthContext, as UserMenu reads it: CMSContext's copy can stay the boot-time
  // placeholder (isAuthenticating) on a first load, which would keep the widget hidden.
  const { user } = React.useContext(AuthContext) || {}
  const { qaTracking, app, apiLoad: cmsApiLoad } = React.useContext(CMSContext) || {}
  const { item: page, apiLoad: pageApiLoad, apiUpdate } = React.useContext(PageContext) || {}
  const apiLoad = pageApiLoad || cmsApiLoad
  const signedIn = !!user?.authed && !user?.isAuthenticating
  const slug = page?.url_slug || ''
  const [covering, setCovering] = React.useState(null)
  const [open, setOpen] = React.useState(false)

  React.useEffect(() => {
    setCovering(null)
    if (!signedIn || !qaTracking?.installs?.length || !apiLoad) return
    let live = true
    findCoveringSite({
      installs: qaTracking.installs,
      patternKeys: qaTracking.patternKeys,
      slug,
      loadSites: (install, refs) => {
        if (!coveredSitesByInstall.has(install.id)) {
          const read = datasetRows(apiLoad, app, refs.patterns, COVERED_SITE_COLUMNS)
          coveredSitesByInstall.set(install.id, read.catch((e) => {
            coveredSitesByInstall.delete(install.id)
            throw e
          }))
        }
        return coveredSitesByInstall.get(install.id)
      },
    })
      .then((found) => { if (live) setCovering(found) })
      .catch((e) => console.warn('Report an issue: reading the QA install failed', e))
    return () => { live = false }
  }, [signedIn, qaTracking, slug, app])

  if (!covering || !UI) return null
  const { Button, Icon } = UI
  const showIconOnly = iconOnly ?? t.iconOnly

  return (
    <>
      <Button activeStyle={activeStyle ?? (showIconOnly ? t.iconButtonStyle : t.buttonStyle)} onClick={() => setOpen(true)} title={label} aria-label={label}>
        <Icon icon={icon} className={t.icon} />
        {showIconOnly ? null : <span className={t.label}>{label}</span>}
      </Button>
      {open ? (
        <ReportIssueForm
          open={open}
          setOpen={setOpen}
          tickets={covering.refs.tickets}
          site={covering.site}
          page={page}
          app={app}
          user={user}
          apiLoad={apiLoad}
          apiUpdate={apiUpdate}
        />
      ) : null}
    </>
  )
}
