import React, {useMemo, useState, useEffect, useContext} from 'react'

import Select from '../../../../ui/components/select/'
import {isJson} from "../index";
import {PageContext} from "../../../../pages/view";
import {ArrowRight} from "../../../icons";
import {Link} from "react-router-dom";
import RenderSwitch from "../dataWrapper/components/Switch";
import {ComponentContext} from "../dataWrapper";

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

const Breadcrumbs = ({ chain }) => {
    return Array.isArray(chain) ? (
        <div className="flex items-center gap-[4px] text-[#37576B] text-[12px] leading-[14.62px] font-semibold tracking-normal">
            {chain.map((c, index) => (
                <div key={index} className="flex items-center shrink-0">
                    <Link to={c.url_slug} className={'w-fit shrink-0 wrap-none'}>{c.title}</Link>
                    {index < chain.length - 1 && <ArrowRight height={8} width={8} className="ml-1 -mt-1" />}
                </div>
            ))}
        </div>
    ) : null;
};


export function Header ({logo = '', title = 'Title', overlay='overlay', note='note', chain, showBreadcrumbs}) {
    const [isMobile, setIsMobile] = useState(window.innerWidth < 1024);

    useEffect(() => {
        const handleResize = () => setIsMobile(window.innerWidth < 1024);

        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

  return overlay === 'full' ? (
      <div
          className="relative w-full h-auto lg:h-[773px] lg:-mb-[145px] flex flex-col lg:flex-row justify-center"
          style={{ background: isMobile ? `none` : `url('${bgImg}') center/cover`}}
      >
          {/* image div */}
          <div
              className="lg:order-last w-full lg:flex-1 h-[699px]"
              style={{ background: isMobile ? `url('${bgImg}') center/cover` : 'none' }}
          >
              <div className="relative top-[90px] w-[708px] mx-auto" />
          </div>

          {/* breadcrumbs, title, note div */}
          <div className="w-full lg:flex-1 flex justify-center lg:justify-end">
              <div className="w-full lg:max-w-[656px] h-full flex items-center pt-12 lg:pt-0">
                  <div className="h-full lg:h-[514px] w-full lg:w-[481px] px-[32px] py-[37px] gap-[16px] bg-white shadow-md rounded-[12px]">
                      <div className="flex flex-col gap-1">
                          <div className="px-1 z-10">
                              {showBreadcrumbs ? <Breadcrumbs chain={chain} /> : null}
                          </div>
                          {title && <div className="flex text-3xl sm:text-[72px] font-[500] font-['Oswald'] text-[#2D3E4C] sm:leading-[72px] uppercase">
                              <img className={'h-[150px] w-[150px]'} alt={' '} src={logo} />
                              {title}
                          </div>}
                      </div>
                      <div className="text-[16px] leading-[24px] text-[#37576B] w-full p-1 pt-2">
                          {note && <div>{note}</div>}
                      </div>
                  </div>
              </div>
          </div>

      </div>



  ) : (
    <div className={`relative w-full ${overlay === 'none' ? 'h-[484px] sm:h-[773px]' : 'h-[773px]'} lg:-mb-[145px] flex flex-col lg:flex-row 
                    bg-fit bg-center justify-center`}>
      {/* image div */}
      <div
        className={`lg:order-last h-[699px] flex-1 rounded-bl-[395px]
        ${overlay === 'none' ? `flex-1 sm:bg-[#1A2732] sm:bg-gradient-to-r from-[#213440] to-[#213440] via-[#213440]/70` : 
        overlay === 'overlay' ? `flex-1 bg-[#1A2732] bg-gradient-to-r from-[#213440] to-[#213440] via-[#213440]/70` : ''}
        `}
        style={
          overlay === 'inset' ?
          { background: `url('${bgImg}')`} : {}}
        >

        {overlay === 'overlay' ?
          <img className='relative top-[90px] w-[708px] w-[708px]' src={bgImg} alt={'overlay image'}/> :
          <div className='relative top-[90px] w-[708px] w-[708px]' />
        }
      </div>

      {/* breadcrumbs, title, note: overlay, inset, full*/}
      <div className='lg:flex-1 top-[150px] sm:top-0'>
        <div className={'w-full lg:max-w-[656px] h-full lg:ml-auto flex items-center pt-12 lg:pt-0'}>
          <div className={overlay === 'none' ? 'hidden' : 'pr-[64px] xl:pl-0 px-[15px]'}>

            <div className={'flex flex-col gap-1'}>
                <div className={'px-1 z-10'}>
                    {
                        showBreadcrumbs ? <Breadcrumbs chain={chain} /> : null
                    }
                </div>
            {title && <div className='text-3xl sm:text-[72px] font-[500] font-["Oswald"] text-[#2D3E4C] sm:leading-[72px] uppercase'>{title}</div>}
            </div>
            <div className='text-[16px] leading-[24px] text-[#37576B] w-full p-1 pt-2'>
              {note && <div>{note}</div>}
            </div>

          </div>
        </div>
      </div>

        {/* breadcrumbs, title, note image: none */}
        <div className={overlay === 'none' ? 'max-w-[1420px] mx-auto px-4 xl:px-[54px] h-fit min-h-[250px] absolute top-[120px] items-center' : 'hidden'}>
            <div className={'p-[56px] h-fit bg-white z-[100] rounded-md shadow-md'}>
                <div className={'flex flex-col gap-1 w-3/4'}>
                    <div className={'px-1 z-10'}>
                        {
                            showBreadcrumbs ? <Breadcrumbs chain={chain} /> : null
                        }
                    </div>
                    {title && <div className='text-3xl sm:text-[72px] font-[500] font-["Oswald"] text-[#2D3E4C] sm:leading-[72px] uppercase'>{title}</div>}
                </div>
                <div className='text-[16px] leading-[24px] text-[#37576B] w-3/4 p-1 pt-2'>
                    {note && <div>{note}</div>}
                </div>
            </div>
        </div>
    </div>
  )
}


const getChain = (dataItems, currentItem) => {
    const {id, parent, title, url_slug} = currentItem;
    if (parent){
        const chainForCurrItem = getChain(dataItems, dataItems.find(di => di.id === parent));
        return [...chainForCurrItem, {id, parent, title, url_slug}]
    }


    return [{id, parent, title, url_slug}];
}

const Edit = () => {
    const {dataItems, menuItems, item} = useContext(PageContext);
    const {state, setState} = useContext(ComponentContext);
    console.log('state?', state)
    const chain = getChain(dataItems, item);

    // return <Header {...compData} chain={chain}/>
    return <></>
}

const View = ({value}) => {
    const {dataItems, item} = useContext(PageContext);
    const {state, setState} = useContext(ComponentContext);
    console.log('state', state)
    const chain = getChain(dataItems, item);
    // return <Header {...data} chain={chain}/>
    return <></>
}

const defaultState = {
    dataRequest: {},
    columns: [{
        "name": "county_seal_url",
        "display_name": "County Seal URL",
        "type": "text",
        show: true
    }],
    data: [],
    display: {},
    sourceInfo: { columns: [{
            "name": "county_seal_url",
            "display_name": "County Seal URL",
            "type": "text",
            show: true
        }] }
}

export default {
    "name": 'Header: MNY1 Data',
    "type": 'Header',
    useDataSource: true,
    defaultState,
    "EditComp": Edit,
    "ViewComp": View
}