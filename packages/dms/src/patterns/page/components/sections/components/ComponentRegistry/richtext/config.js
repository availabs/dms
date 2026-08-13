import { RichtextEdit, RichtextView } from './index'

const bgColorOptions = [
    '#FFFFFF',
    '#F3F8F9',
    '#FCF6EC',
    'rgba(0,0,0,0)'
];

/**
 * Generate style options dynamically from theme's lexical styles.
 * Style 0 is always "Default", additional styles are shown if they have a name.
 */
const getStyleOptions = (theme) => {
    const styles = theme?.lexical?.styles || [];
    return [
        { label: 'Default', value: '' },  // Style 0 is always default
        ...styles
            .filter((s, i) => i > 0 && s.name)  // Skip style 0, require name
            .map(s => ({
                label: s.label || s.name,  // Use label if provided, else name
                value: s.name
            }))
    ];
};

/**
 * Inner-padding options, sourced from `theme.richtext.paddings` so the BRAND owns
 * the actual values (and a theme that ships none simply offers no override). The
 * empty value = the site default (`theme.richtext.contentPadding`), which is what
 * every existing section resolves to.
 */
const getPaddingOptions = (theme) => {
    const paddings = theme?.richtext?.paddings || {};
    const keys = Object.keys(paddings);
    if (!keys.length) return [];
    return [{ label: 'Theme default', value: '' },
        ...keys.map(k => ({ label: k.charAt(0).toUpperCase() + k.slice(1), value: k }))];
};

export default {
    name: 'Rich Text',
    EditComp: RichtextEdit,
    ViewComp: RichtextView,
    defaultState: {
        display: {
            isCard: '',
            bgColor: 'rgba(0,0,0,0)',
            showToolbar: false
        }
    },
    controls: (theme) => ({
        default: [
            {
                type: 'toggle',
                label: 'Show Toolbar',
                key: 'showToolbar',
                icon: 'Toolbar'
            },
            {
                type: 'select',
                label: 'Style',
                key: 'isCard',
                options: getStyleOptions(theme),
                onChange: ({key, value, state}) => {
                    // Reset bgColor when switching away from Annotation
                    if (value !== 'Annotation' && state.display?.bgColor) {
                        state.display.bgColor = 'rgba(0,0,0,0)';
                    }
                }
            },
            {
                // Per-section inner padding. Lets a page title sit FLUSH with the
                // cards below it (the section's own gutter padding already supplies
                // that inset) without changing the site's prose padding.
                type: 'select',
                label: 'Padding',
                key: 'contentPadding',
                options: getPaddingOptions(theme),
                displayCdn: () => getPaddingOptions(theme).length > 0
            },
            {
                type: 'colorpicker',
                label: 'Background',
                key: 'bgColor',
                colors: bgColorOptions,
                showColorPicker: false,
                displayCdn: ({display}) => !!display?.isCard
            }
        ]
    })
}
