import { QA_STYLES, qaTextStyles, qaFlatThemes } from './qa.theme'

// The qa pattern's default theme, carried by the library default theme under `qa` (as the page and
// datasets patterns carry theirs under `pages` and `datasets`). A site's theme restyles QA by setting
// only what differs under its own `qa` key; the theme merge combines the two key by key.
// withQaTheme.js applies it on QA pages.

// Named styles keyed by name, so a site can override one property of one style
// (`qa: { styles: { layoutGroup: { qa_header: { wrapper2: '…' } } } }`).
const byName = (styles) => Object.fromEntries(styles.map(({ name, ...style }) => [name, style]))

export default {
  // the wrapper around a QA page (pages/view.jsx): no box of its own
  pageWrapper: 'contents',
  // CSS custom properties set on that wrapper, e.g. a site's palette and fonts for QA pages only
  // (`{ '--t-ink': '#2D3E4C', '--t-font-prose': '"Proxima Nova", sans-serif' }`)
  vars: {},
  // keys added to every layout style on QA pages (e.g. `childWrapper`, the box around all the bands)
  layout: {},
  // named styles by the theme key their component reads (dataCard, layoutGroup, pill, …)
  styles: Object.fromEntries(Object.entries(QA_STYLES).map(([key, styles]) => [key, byName(styles)])),
  // text styles, added to textSettings (a QA Card cell's valueFontStyle / headerFontStyle)
  text: qaTextStyles,
  // flat component themes (flowStep, dataBar, stackedBar, filterControlCell), under the site's own
  components: qaFlatThemes,
}
