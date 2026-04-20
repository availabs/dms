import { HeaderEdit, HeaderView } from './header'

const getData = ({position='above', bgImg='/img/header.png', logo='/img/nygov-logo.png', bgClass='', title='MitigateNY', subTitle='New York State Hazard Mitigation Plan', note='2023 Update'}) => {
    return new Promise((resolve) => {
        resolve({
            position,
            bgImg,
            bgClass,
            logo,
            title,
            subTitle,
            note
        })
    })
}

export default {
    "name": 'Header: Default',
    "type": 'Header',
    "variables": [
        { name: 'bgImg', default: '/img/header.png' },
        { name: 'logo', default: '/img/nygov-logo.png' },
        { name: 'title', default: 'MitigateNY' },
        { name: 'subTitle', default: 'New York State Hazard Mitigation Plan' },
        { name: 'bgClass', default: '' },
        { name: 'note', default: '2023 Update' }
    ],
    defaultState: {
        display: {
            title: 'MitigateNY',
            subTitle: 'New York State Hazard Mitigation Plan',
            note: '2023 Update',
            bgClass: '',
            bgImg: '',
            logo: '',
            height: 300
        }
    },
    controls: {
        default: [
            { type: 'input', label: 'Title', key: 'title', defaultValue: 'MitigateNY' },
            { type: 'input', label: 'Subtitle', key: 'subTitle', defaultValue: 'New York State Hazard Mitigation Plan' },
            { type: 'input', label: 'Note', key: 'note', defaultValue: '2023 Update' },
            { type: 'input', label: 'Background Class', key: 'bgClass', defaultValue: '' },
            { type: 'input', label: 'Background Image', key: 'bgImg', defaultValue: '' },
            { type: 'input', label: 'Logo', key: 'logo', defaultValue: '' },
            { type: 'input', inputType: 'number', label: 'Height', key: 'height', defaultValue: 300 }
        ]
    },
    getData,
    "EditComp": HeaderEdit,
    "ViewComp": HeaderView
}
