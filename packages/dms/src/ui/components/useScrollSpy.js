import { useState, useEffect } from 'react'

/**
 * useScrollSpy — track which anchored section is currently in view.
 *
 * Observes the DOM elements whose ids are passed in (the section wrappers that
 * `getInPageNav` links to) with an IntersectionObserver and returns the id of
 * the section nearest the top of the viewport. The `rootMargin` top inset is
 * tuned to the ~120px sticky page-header offset so the "active" item flips as a
 * heading clears the header, not when it touches the very top of the window.
 *
 * Returns the active anchor id (string) or '' when nothing is intersecting.
 */
export function useScrollSpy(anchorIds = [], { topOffset = 128, bottomMargin = '-60%' } = {}) {
    const [activeId, setActiveId] = useState('')
    // stable primitive dep so the effect doesn't re-run on every render's new array identity
    const idKey = anchorIds.filter(Boolean).join('|')

    useEffect(() => {
        const ids = idKey ? idKey.split('|') : []
        if (!ids.length || typeof IntersectionObserver === 'undefined') return

        const visible = new Map() // id -> intersectionRatio, for picking the most-in-view

        const observer = new IntersectionObserver(
            entries => {
                entries.forEach(entry => {
                    if (entry.isIntersecting) {
                        visible.set(entry.target.id, entry.intersectionRatio)
                    } else {
                        visible.delete(entry.target.id)
                    }
                })
                // active = the intersecting section that comes first in document order
                const current = ids.find(id => visible.has(id))
                if (current) setActiveId(current)
            },
            { rootMargin: `-${topOffset}px 0px ${bottomMargin} 0px`, threshold: [0, 0.1, 0.5, 1] }
        )

        const els = ids.map(id => document.getElementById(id)).filter(Boolean)
        els.forEach(el => observer.observe(el))
        return () => observer.disconnect()
    }, [idKey, topOffset, bottomMargin])

    return activeId
}
