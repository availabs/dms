// Islands path (static-html-islands.md): the page's static section HTML, handed to StaticSlot during the
// server render of a document request (servePage.js) instead of travelling in the page's island data. Without
// it the data would repeat every byte of the content's HTML, doubling the document for no gain: the browser
// already has that HTML in the page.
import React from 'react'

export const SlotHtmlContext = React.createContext(null)
