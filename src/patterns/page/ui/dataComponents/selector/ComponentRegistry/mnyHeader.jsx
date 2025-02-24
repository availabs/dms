import React, { useMemo, useState, useEffect }from 'react'

import Select from '../../../../ui/components/select/'
import {isJson} from "../index";


export function Header ({position = 'above',bgImg = '/themes/mny/takeaction_landuse_2tp.png' , logo = '', title = 'Title', overlay='overlay', note='note', height=673}) {

  return (
    <div className={`lg:-mb-[145px] bg-fit bg-center w-full flex flex-col lg:flex-row w-full lg:h-[773px]`}>
      <div 
        className='lg:order-last h-[699px] rounded-bl-[395px] flex-1' 
        style={overlay === 'inset' ? 
          { background: `url('${bgImg}')`} :
          { background: 'linear-gradient(0deg, #1A2732, #1A2732),linear-gradient(81.58deg, #213440 67.87%, #37576B 189.24%)'}}
        >
        {overlay === 'overlay' && <img className='relative top-[90px] w-[708px] w-[708px]' src={bgImg} />}
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
      },
      {
        label: 'Transportation',
        value: '/themes/mny/transportation.png'
      },
      { 
        "label": "Set1 - Avalanche",
        "value": "/themes/mny/Avalanche - transparent.png"
      },
      { 
        "label": "Set1 - Built Environment",
        "value": "/themes/mny/Built Environment - transparent.png"
      },
      { 
        "label": "Set1 - Capabilities and Resources",
        "value": "/themes/mny/Capabilities and Resources - transparent.png"
      },
      { 
        "label": "Set1 - Coastal Hazards",
        "value": "/themes/mny/Coastal Hazards - transparent.png"
      },
      { 
        "label": "Set1 - Drought",
        "value": "/themes/mny/Drought - transparent.png"
      },
      { 
        "label": "Set1 - Earthquake",
        "value": "/themes/mny/Earthquake - transparent.png"
      },
      { 
        "label": "Set1 - Extreme Cold",
        "value": "/themes/mny/Extreme Cold - transparent.png"
      },
      { 
        "label": "Set1 - Extreme Heat",
        "value": "/themes/mny/Extreme Heat - transparent.png"
      },
      { 
        "label": "Set1 - Flooding",
        "value": "/themes/mny/Flooding - transparent.png"
      },
      { 
        "label": "Set1 - Funding",
        "value": "/themes/mny/Funding - transparent.png"
      },
      { 
        "label": "Set1 - Hail",
        "value": "/themes/mny/Hail - transparent.png"
      },
      { 
        "label": "Set1 - Hazards & Disasters",
        "value": "/themes/mny/Hazards & Disasters - transparent.png"
      },
      { 
        "label": "Set1 - Hurricane",
        "value": "/themes/mny/Hurricane - transparent.png"
      },
      { 
        "label": "Set1 - Ice Storm",
        "value": "/themes/mny/Ice Storm - transparent.png"
      },
      { 
        "label": "Set1 - Landslide",
        "value": "/themes/mny/Landslide - transparent.png"
      },
      { 
        "label": "Set1 - Lightning",
        "value": "/themes/mny/Lightning - transparent.png"
      },
      { 
        "label": "Set1 - Natural Environment",
        "value": "/themes/mny/Natural Environment - transparent.png"
      },
      { 
        "label": "Set1 - People and Communities",
        "value": "/themes/mny/People and Communities - transparent.png"
      },
      { 
        "label": "Set1 - Planning",
        "value": "/themes/mny/Planning - transparent.png"
      },
      { 
        "label": "Set1 - Snowstorm",
        "value": "/themes/mny/Snowstorm - transparent.png"
      },
      { 
        "label": "Set1 - Strategies",
        "value": "/themes/mny/Strategies - transparent.png"
      },
      { 
        "label": "Set1 - Take Action",
        "value": "/themes/mny/Take Action - transparent.png"
      },
      { 
        "label": "Set1 - Tornado",
        "value": "/themes/mny/Tornado - transparent.png"
      },
      { 
        "label": "Set1 - Whats At Risk",
        "value": "/themes/mny/Whats At Risk - transparent.png"
      },
      { 
        "label": "Set1 - Wildfire",
        "value": "/themes/mny/Wildfire - transparent.png"
      },
      { 
        "label": "Set1 - Wind",
        "value": "/themes/mny/Wind - transparent.png"
      }
    ]

    const insetImageOptions = [
      {
        label: 'Planetary Hazard',
        value: '/themes/mny/inset_hazard.png'
      },
      {
        label: 'Planetary County',
        value: '/themes/mny/inset_county.jpeg'
      }
    ]
   
    const baseUrl = '/';
    const [loading, setLoading] = useState(true);
    const [status, setStatus] = useState('');
    const [compData, setCompData] = useState({
        bgImg: cachedData.bgImg || overlayImageOptions[1].value,//'/img/header.png', 
        title: cachedData.title || 'Title', 
        note: cachedData.note || 'note',
        overlay: cachedData.overlay || 'overlay'
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
                <Select options={compData.overlay === 'inset' ? insetImageOptions : overlayImageOptions } value={compData.bgImg} onChange={(e) => setCompData({...compData, bgImg: e.target.value})} />
              </div>
            </div>

           <div className={'flex flex-row flex-wrap justify-between'}>
              <label className={'shrink-0 pr-2 py-1 my-1 w-1/4'}>Img Position</label>
              <div className={`flex flex row w-3/4 shrink my-1`}>
                <Select 
                  options={[{
                    label: 'Overlay',
                    value: 'overlay'
                  },
                  {
                    label: 'Inset',
                    value: 'inset'
                  }]} 
                  value={compData.overlay} 
                  onChange={(e) => {
                    setCompData({...compData,
                      bgImg: e.target.value === 'inset' ? insetImageOptions[0].value : overlayImageOptions[0].value,
                      overlay: e.target.value
                    })
                  }} />
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