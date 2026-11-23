import { PdfExport } from './ExportPdf'

export default {
  "name": 'PDF Generator',
  "type": 'PDF Generator',
  defaultState: {},
  // RSC path: it lists the site's patterns (CMSContext.sitePatterns), which a section island doesn't carry,
  // so a page with one stays on today's path (render/rsc, rscSections.js)
  serverIsland: false,
  "EditComp": PdfExport,
  "ViewComp": PdfExport
};
