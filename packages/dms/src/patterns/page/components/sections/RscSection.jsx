import React from "react"
import { RscCaptureContext } from "../../../../render/rsc/captureContext"

/**
 * RSC path, server pass only (rendered by sectionArray's view when RscCaptureContext is set). Gives the
 * section its own capture object, so that what the section finds out while it renders (useDataLoader:
 * "my rows load in the browser") marks this section, not the page, and wraps its HTML in a
 * `data-dms-island` element the browser can find again. resolvePage.js turns every section whose capture
 * is not eligible into a section island.
 */
export default function RscSection({ capture, index, section, children }) {
    const [sectionCapture] = React.useState(() => {
        const sc = { key: capture.sections.length, index, eligible: capture.sectionServerStatic(section), reason: null }
        capture.sections.push(sc)
        return sc
    })
    return (
        <div data-dms-island={sectionCapture.key} style={{ display: 'contents' }}>
            <RscCaptureContext.Provider value={sectionCapture}>{children}</RscCaptureContext.Provider>
        </div>
    )
}
