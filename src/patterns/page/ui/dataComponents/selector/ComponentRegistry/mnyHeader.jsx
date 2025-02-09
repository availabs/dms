import React, { useMemo, useState, useEffect }from 'react'
import {Select} from '../../../'
import {isJson} from "../index";


export function Header ({position = 'above',bgImg = '/themes/mny/takeaction_landuse_2tp.png' , logo = '', title = 'Title', inset=true, note='note', height=673}) {

  return (
    <div className={`lg:-mb-[145px] bg-fit bg-center w-full flex flex-col lg:flex-row w-full lg:h-[773px]`}>
      <div 
        className='lg:order-last h-[699px] rounded-bl-[395px] flex-1' 
        style={inset ? 
          { background: `url('/themes/mny/inset_hazard.png')`} :
          { background: 'linear-gradient(0deg, #1A2732, #1A2732),linear-gradient(81.58deg, #213440 67.87%, #37576B 189.24%)'}}
        >
        <img className='relative top-[90px] w-[708px] w-[708px]' src={bgImg} />
      </div>
      <div className='lg:flex-1'>
        <div className='pt-12 lg:pt-0 lg:max-w-[656px]  w-full flex lg:ml-auto  h-full items-center'>
          
          <div className='pr-[64px] xl:pl-0 px-[15px]'> 
            <div>
            {title && <div className='text-3xl sm:text-[72px] font-[500] font-["Oswald"] text-[#2D3E4C] sm:leading-[72px] uppercase'>{title}</div>}
            </div>
            <div className='text-[16px] leading-[24px] text-[#37576B] w-full p-1 pt-2'>
              {note && <div>{note}</div>}
            </div>
          </div>
        </div>
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

    const overlayImageOptions = [
      {
        label: 'Planetary Home',
        value: '/themes/mny/header_home.png'
      },
      {
        label: 'Planetary Buildings',
        value: '/themes/mny/header_image1.png'
      },
      {
        label: 'Hazards - Coastal',
        value: '/themes/mny/hazards_coastal_2tp.png'
      },
      {
        label: 'Hazards - Flood',
        value: '/themes/mny/hazards_flood_2tp.png'
      },
      {
        label: 'Hazards - Landslide',
        value: '/themes/mny/hazards_landslide_1tp.png'
      },
      {
        label: 'Hazards - Wildfire',
        value: '/themes/mny/hazards_wildfire_1tp.png'
      },
      {
        label: 'Take Action - Capabilities',
        value: '/themes/mny/takeaction_capab_2tp.png'
      },
      {
        label: 'Take Action - Landuse',
        value: '/themes/mny/takeaction_landuse_2tp.png'
      }

    ]

    const insetImageOptions = [
      {
        label: 'Planetary Home',
        value: '/themes/mny/insert_disaster.png'
      },
      {
        label: 'Planetary Hazard',
        value: '/themes/mny/inset_hazard.png'
      },
      {
        label: 'Planetary County',
        value: '/themes/mny/inset_county.jpg'
      }
    ]
   
    const baseUrl = '/';
    const [loading, setLoading] = useState(true);
    const [status, setStatus] = useState('');
    const [compData, setCompData] = useState({
        bgImg: cachedData.bgImg || overlayImageOptions[1].value,//'/img/header.png', 
        title: cachedData.title || 'Title', 
        note: cachedData.note || 'note',
        
    })

    useEffect(() => {
      if(value !== JSON.stringify(compData)) {
        onChange(JSON.stringify(compData))
      }
    },[compData])

    return (
      <div className='w-full'>
        <div className='relative'>
          <div className={'border rounded-md border-blue-500 bg-blue-50 p-2 m-1 pt-[100px]'}>

            <div className={'flex flex-row flex-wrap justify-between'}>
              <label className={'shrink-0 pr-2 py-1 my-1 w-1/4'}>Title:</label>
              <div className={`flex flex row w-3/4 shrink my-1`}>
                <input type='text' value={compData.title} onChange={(e) => setCompData({...compData, title: e.target.value})} />
              </div>
            </div>

            

            <div className={'flex flex-row flex-wrap justify-between'}>
              <label className={'shrink-0 pr-2 py-1 my-1 w-1/4'}>Note:</label>
              <div className={`flex flex row w-3/4 shrink my-1`}>
                <input type='text' value={compData.note} onChange={(e) => setCompData({...compData, note: e.target.value})} />
              </div>
            </div>

           

            <div className={'flex flex-row flex-wrap justify-between'}>
              <label className={'shrink-0 pr-2 py-1 my-1 w-1/4'}>bgImg:</label>
              <div className={`flex flex row w-3/4 shrink my-1`}>
                <Select options={imageOptions} value={compData.bgImg} onChange={(e) => setCompData({...compData, bgImg: e.target.value})} />
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
    "name": 'Header: MNY1',
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