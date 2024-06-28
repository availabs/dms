import React, { useMemo, useState, useEffect }from 'react'
import {isJson} from "../index";


export function Header ({position = 'above',bgImg = '', logo = '', title = 'Title', bgClass='', subTitle='subTitle', note='note'}) {
  
  return (
    <div className={`h-[300px] bg-cover bg-center w-full flex ${bgClass}`} style={{ backgroundImage: `url("${bgImg}")` }}>
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

const Edit = ({value, onChange, size}) => {
    
    let cachedData = useMemo(() => {
        return value && isJson(value) ? JSON.parse(value) : {}
    }, [value]);

    //console.log('Edit: value,', size)
   
    const baseUrl = '/';

    const ealSourceId = 343;
    const [loading, setLoading] = useState(true);
    const [status, setStatus] = useState('');
    const [compData, setCompData] = useState({
        bgImg: cachedData.bgImg || '',//'/img/header.png', 
        logo: cachedData.logo || '',//'/img/nygov-logo.png', 
        title: cachedData.title || 'Title', 
        subTitle: cachedData.subTitle || 'subTitle', 
        note: cachedData.note || 'note',
        bgClass: cachedData.bgClass || ''
    })

    useEffect(() => {
      if(value !== JSON.stringify(compData)) {
        onChange(JSON.stringify(compData))
      }
    },[compData])

    return (
      <div className='w-full'>
        <div className='relative'>
          <div className={'border rounded-md border-blue-500 bg-blue-50 p-2 m-1'}>
            <div className={'flex flex-row flex-wrap justify-between'}>
              <label className={'shrink-0 pr-2 py-1 my-1 w-1/4'}>Title:</label>
              <div className={`flex flex row w-3/4 shrink my-1`}>
                <input type='text' value={compData.title} onChange={(e) => setCompData({...compData, title: e.target.value})} />
              </div>
            </div>

            <div className={'flex flex-row flex-wrap justify-between'}>
              <label className={'shrink-0 pr-2 py-1 my-1 w-1/4'}>subTitle:</label>
              <div className={`flex flex row w-3/4 shrink my-1`}>
                <input type='text' value={compData.subTitle} onChange={(e) => setCompData({...compData, subTitle: e.target.value})} />
              </div>
            </div>

            <div className={'flex flex-row flex-wrap justify-between'}>
              <label className={'shrink-0 pr-2 py-1 my-1 w-1/4'}>Note:</label>
              <div className={`flex flex row w-3/4 shrink my-1`}>
                <input type='text' value={compData.note} onChange={(e) => setCompData({...compData, note: e.target.value})} />
              </div>
            </div>

            <div className={'flex flex-row flex-wrap justify-between'}>
              <label className={'shrink-0 pr-2 py-1 my-1 w-1/4'}>Bg Class:</label>
              <div className={`flex flex row w-3/4 shrink my-1`}>
                <input type='text' value={compData.bgClass} onChange={(e) => setCompData({...compData, bgClass: e.target.value})} />
              </div>
            </div>

            <div className={'flex flex-row flex-wrap justify-between'}>
              <label className={'shrink-0 pr-2 py-1 my-1 w-1/4'}>bgImg:</label>
              <div className={`flex flex row w-3/4 shrink my-1`}>
                <input type='text' value={compData.bgImg} onChange={(e) => setCompData({...compData, bgImg: e.target.value})} />
              </div>
            </div>

            <div className={'flex flex-row flex-wrap justify-between'}>
              <label className={'shrink-0 pr-2 py-1 my-1 w-1/4'}>logo:</label>
              <div className={`flex flex row w-3/4 shrink my-1`}>
                <input type='text' value={compData.logo} onChange={(e) => setCompData({...compData, logo: e.target.value})} />
              </div>
            </div>
          </div>
          <Header {...compData}/>
        </div>
      </div>
    ) 

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
    getData,
    "EditComp": Edit,
    "ViewComp": View
}