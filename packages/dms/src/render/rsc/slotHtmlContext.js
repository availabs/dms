// RSC spike (rsc-view-pages.md, phase 2): the page's static section HTML, handed to StaticSlot during the
// SSR render of a document request (generateHTML) instead of travelling in the RSC payload. Without it the
// payload repeats every byte of the content's HTML, doubling the document for no gain: the browser already
// has that HTML in the page. Client and SSR environments only (react-server has no createContext).
import React from 'react'

export const SlotHtmlContext = React.createContext(null)
