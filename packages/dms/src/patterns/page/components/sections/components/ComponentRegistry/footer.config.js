import { Footer } from './footer'

export default {
    "name": 'Footer: MNY',
    "type": 'Footer',
    useDataSource: false,
    defaultState: {
    },
    controls: {
        more: [
            {type: 'input', inputType: 'text', label: 'Disclaimer', key: 'disclaimer'},
            {type: 'input', inputType: 'text', label: 'Privacy Policy URL', key: 'privacyPolicyURL'},
            {type: 'input', inputType: 'text', label: 'Terms and Conditions URL', key: 'termsURL'}
        ]
    },
    "EditComp": Footer,
    "ViewComp": Footer
}
