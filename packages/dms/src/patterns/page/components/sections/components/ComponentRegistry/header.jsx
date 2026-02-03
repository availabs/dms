import React, { useMemo, useContext, useEffect } from 'react';
import { ComponentContext } from '../../../../context';
import { isEqual } from 'lodash-es';

const isJson = (str) => {
    try {
        JSON.parse(str);
    } catch (e) {
        return false;
    }
    return true;
}

// Default gradient as inline style (Tailwind classes get purged when dynamic)
const DEFAULT_GRADIENT = 'linear-gradient(to bottom right, #0f172a, #1e293b, #1e3a8a)';

export function Header ({position = 'above', bgImg = '', logo = '', title = 'Title', bgClass='', subTitle='subTitle', note='note', height=300}) {
  // Determine background: image takes priority, then bgClass, then default gradient
  const backgroundStyle = bgImg
    ? { backgroundImage: `url("${bgImg}")` }
    : bgClass
      ? {}  // Use bgClass via className
      : { background: DEFAULT_GRADIENT };

  return (
    <div
      className={`bg-cover bg-center w-full flex ${bgClass}`}
      style={{ ...backgroundStyle, height }}>
      <div className='p-2'>
        {logo && <img src={logo} alt="NYS Logo" />}
      </div>
      <div className='flex-1 flex flex-col  items-center p-4'>
        <div className='flex-1'/>
        <div className='text-3xl sm:text-7xl font-bold text-[#f2a91a] text-right w-full text-display'>
          {title && <div>{title}</div>}
        </div>
        <div className='text-lg tracking-wider pt-2 sm:text-3xl font-bold text-slate-200 text-right w-full uppercase'>
          {subTitle && <div>{subTitle}</div>}
        </div>
        <div className='text-lg tracking-wider sm:text-xl font-bold text-slate-200 text-right w-full uppercase'>
          {note && <div>{note}</div>}
        </div>
        <div className='flex-1'/>
      </div>
    </div>
  )
}

const getData = ({position='above',bgImg='/img/header.png', logo='/img/nygov-logo.png',bgClass = '', title='MitigateNY', subTitle='New York State Hazard Mitigation Plan', note='2023 Update'}) =>{
  return new Promise((resolve, reject) => {
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

const Edit = ({value, onChange}) => {
    const { state, setState } = useContext(ComponentContext);

    const cachedData = useMemo(() => {
        return value && isJson(value) ? JSON.parse(value) : {}
    }, [value]);

    // Get settings from ComponentContext.state.display (with defaults)
    const title = state?.display?.title || 'MitigateNY';
    const subTitle = state?.display?.subTitle || 'New York State Hazard Mitigation Plan';
    const note = state?.display?.note || '2023 Update';
    const bgClass = state?.display?.bgClass || '';
    const bgImg = state?.display?.bgImg || '';
    const logo = state?.display?.logo || '';
    const height = state?.display?.height || 300;

    // Sync state.display changes to element-data via onChange
    useEffect(() => {
        const newData = {
            title: state?.display?.title ?? 'MitigateNY',
            subTitle: state?.display?.subTitle ?? 'New York State Hazard Mitigation Plan',
            note: state?.display?.note ?? '2023 Update',
            bgClass: state?.display?.bgClass ?? '',
            bgImg: state?.display?.bgImg ?? '',
            logo: state?.display?.logo ?? '',
            height: state?.display?.height ?? 300
        };
        const currentData = value && isJson(value) ? JSON.parse(value) : {};

        if (!isEqual(newData, currentData)) {
            onChange(JSON.stringify(newData));
        }
    }, [state?.display?.title, state?.display?.subTitle, state?.display?.note, state?.display?.bgClass, state?.display?.bgImg, state?.display?.logo, state?.display?.height]);

    // Initialize state.display from saved data on mount
    useEffect(() => {
        if (Object.keys(cachedData).length > 0) {
            setState(draft => {
                if (!draft.display) draft.display = {};
                if (cachedData.title !== undefined && draft.display.title === undefined) {
                    draft.display.title = cachedData.title;
                }
                if (cachedData.subTitle !== undefined && draft.display.subTitle === undefined) {
                    draft.display.subTitle = cachedData.subTitle;
                }
                if (cachedData.note !== undefined && draft.display.note === undefined) {
                    draft.display.note = cachedData.note;
                }
                if (cachedData.bgClass !== undefined && draft.display.bgClass === undefined) {
                    draft.display.bgClass = cachedData.bgClass;
                }
                if (cachedData.bgImg !== undefined && draft.display.bgImg === undefined) {
                    draft.display.bgImg = cachedData.bgImg;
                }
                if (cachedData.logo !== undefined && draft.display.logo === undefined) {
                    draft.display.logo = cachedData.logo;
                }
                if (cachedData.height !== undefined && draft.display.height === undefined) {
                    draft.display.height = cachedData.height;
                }
            });
        }
    }, []);

    return (
        <div className='w-full'>
            <Header
                title={title}
                subTitle={subTitle}
                note={note}
                bgClass={bgClass}
                bgImg={bgImg}
                logo={logo}
                height={height}
            />
        </div>
    );
}

const View = ({value}) => {
    if(!value) return ''
    let data = typeof value === 'object' ?
        value['element-data'] : 
        JSON.parse(value)
    
    return <Header {...data} />
             
}

Edit.settings = {
    hasControls: true,
    name: 'ElementEdit'
}


export default {
    "name": 'Header: Default',
    "type": 'Header',
    "variables": [
        {
          name:'bgImg',
          default: '/img/header.png',
        },
        {
          name:'logo',
          default: '/img/nygov-logo.png',
        },
        {
          name:'title',
          default: 'MitigateNY',
        },
        {
          name: 'subTitle',
          default: 'New York State Hazard Mitigation Plan',
        },
        {
          name: 'bgClass',
          default: '',
        },
        {
          name:'note',
          default: '2023 Update',
        }
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
    "EditComp": Edit,
    "ViewComp": View
}