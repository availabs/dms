import React from "react"
import { IslandsCaptureContext } from "../../../../render/islands/captureContext"

/**
 * Islands path, server pass only (rendered by sectionArray's view when IslandsCaptureContext is set). Gives the
 * section its own capture object, so that what the section finds out while it renders (useDataLoader:
 * "my rows load in the browser") marks this section, not the page, and wraps its HTML in a
 * `data-dms-island` element the browser can find again. render/islands/islandData.js turns every section whose
 * capture is not eligible into a section island.
 */
export default function CapturedSection({ capture, index, section, children }) {
    const [sectionCapture] = React.useState(() => {
        const eligible = capture.sectionServerStatic(section)
        // `wake`: an island that keeps this HTML until the reader uses it (staticSections.js sectionWakeOnUse)
        const sc = { key: capture.sections.length, index, eligible, wake: !eligible && capture.sectionWakeOnUse(section), reason: null }
        capture.sections.push(sc)
        return sc
    })
    return (
        <div data-dms-island={sectionCapture.key} style={{ display: 'contents' }}>
            <IslandsCaptureContext.Provider value={sectionCapture}>{children}</IslandsCaptureContext.Provider>
        </div>
    )
}
