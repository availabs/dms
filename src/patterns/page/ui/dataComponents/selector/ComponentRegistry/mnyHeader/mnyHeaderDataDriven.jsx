import React, {useContext, useMemo, useState} from 'react'
import {PageContext} from "../../../../../pages/view";
import {ArrowRight, Search} from "../../../../icons";
import {Link} from "react-router-dom";
import {ComponentContext} from "../../dataWrapper";
import {overlayImageOptions, insetImageOptions} from "./consts";
import {SearchPallet} from "../../../../../components/search";
import {CMSContext} from "../../../../../siteConfig";

const Breadcrumbs = ({ chain, show }) => {
    if(!show) return null;
    return Array.isArray(chain) ? (
        <div className={'px-1 z-[5]'}>
            <div className="flex items-center gap-[4px] text-[#37576B] text-[12px] sm:text-[14px] leading-[100%] tracking-normal">
                {chain.map((c, index) => (
                    <div key={index} className={`flex items-center shrink-0`}>
                        <Link to={c.url_slug} className={`w-fit shrink-0 wrap-none ${index === chain.length - 1 ? `font-regular` : `font-semibold`}`}>{c.title}</Link>
                        {index < chain.length - 1 && <ArrowRight height={12} width={12} className="ml-1 -mt-1" />}
                    </div>
                ))}
            </div>
        </div>
    ) : null;
};

const SearchButton = ({app, type, show}) => {
    const [open, setOpen] = useState(false);
    const [searchStr, setSearchStr] = useState('');
    if(!show) return null;
    return (
        <>
            <div
                className={`
                            bg-white flex justify-between items-center
                            h-[56px] w-full py-[16px] px-[24px]
                            rounded-[1000px]
                            shadow-[0px_2px_4px_0px_rgba(0,0,0,0.08)]
                            focus-within:ring-2 focus-within:ring-[#6D96AE]
                            shadow-sm transition ease-in
                          `}
            >
                <input
                    className="w-full focus:outline-none focus:ring-0 text-[#37576B] font-normal text-[16px] leading-[140%]"
                    placeholder="Search for anything..."
                    onChange={e => setSearchStr(e.target.value)}
                    onKeyDown={e => {
                        if (e.key === 'Enter') setOpen(true);
                    }}
                />

                <Search
                    height={24}
                    width={24}
                    className="text-[#2D3E4C] p-0.5"
                    onClick={() => setOpen(true)}
                />
            </div>

            <SearchPallet open={open} setOpen={setOpen} app={app} type={type} searchStr={searchStr}/>
        </>
    )
}

const Title = ({title, titleSize, logo}) => {
    if(!title) return;

    return (
        <div className={`flex gap-1 text-[36px] ${titleSize} font-medium font-['Oswald'] text-[#2D3E4C] sm:leading-[100%] uppercase`}>
            {logo && <img className={'max-w-[150px] max-h-[150px]'} alt={' '} src={logo}/>}
            {title}
        </div>
    )
}
export function Header ({app, type, title, note, logo, overlay='overlay', bgImg, chain, showBreadcrumbs, showSearchBar, titleSize='sm:text-[72px] tracking-[0px]'}) {
    return overlay === 'full' ? (
        <div
            className="relative w-full h-auto lg:h-[773px] lg:-mb-[145px] flex flex-col lg:flex-row justify-center"
            style={{ background: `url('${bgImg}') center/cover`}}
        >
            {/* image div */}
            <div
                className="lg:order-last w-full lg:flex-1 h-[699px]"

            >
                <div className="relative top-[90px] mx-auto" />
            </div>

            {/* breadcrumbs, title,note div */}
            <div className="absolute lg:static sm:flex-1">
                <div className="ml-auto px-[15px] lg:pl-0 lg:w-[656px] h-full flex items-center pt-12 lg:pt-[80px]">
                    <div className=" w-full lg:w-[481px] px-[32px] py-[37px] gap-[16px] bg-white shadow-md rounded-[12px]">
                        <div className="flex flex-col gap-1">
                            <Breadcrumbs chain={chain} show={showBreadcrumbs}/>
                            <Title title={title} titleSize={titleSize} logo={logo} />
                        </div>
                        <div className="text-[16px] leading-[24px] text-[#37576B] w-full p-1 pt-2">
                            {note && <div>{note}</div>}
                        </div>
                        <SearchButton app={app} type={type} show={showSearchBar}/>
                    </div>
                </div>
            </div>

        </div>



    ) : (
        <div className={`relative w-full ${overlay === 'none' ? 'h-[484px] sm:h-[773px] -mb-[529px]' : 'h-[773px] lg:-mb-[145px]'}  flex flex-col lg:flex-row 
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
                            <Breadcrumbs chain={chain} show={showBreadcrumbs}/>
                            <Title title={title} titleSize={titleSize} logo={logo} />
                        </div>
                        <div className='text-[16px] leading-[24px] text-[#37576B] w-full p-1 pt-2'>
                            {note && <div>{note}</div>}
                        </div>
                        <SearchButton app={app} type={type} show={showSearchBar}/>
                    </div>
                </div>
            </div>

            {/* breadcrumbs, title, note image: none */}
            <div className={overlay === 'none' ? 'max-w-[1420px] w-full mx-auto px-4 xl:px-[54px] h-[238px] absolute top-[118px] items-center' : 'hidden'}>
                <div className={'p-[56px] h-full bg-white z-[100] rounded-lg shadow-md'}>
                    <div className={'flex flex-col gap-1 w-3/4'}>
                        <Breadcrumbs chain={chain} show={showBreadcrumbs}/>
                        <Title title={title} titleSize={titleSize} logo={logo} />
                    </div>
                    <div className='text-[16px] leading-[24px] text-[#37576B] w-3/4 p-1 pt-2'>
                        {note && <div>{note}</div>}
                    </div>
                    <SearchButton app={app} type={type} show={showSearchBar}/>
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

const HeaderWrapper = ({isEdit}) => {
    const {dataItems, item} = useContext(PageContext);
    const {app, type} = useContext(CMSContext);
    const {state: {display, data, columns}} = useContext(ComponentContext);

    const titleColumn = useMemo(() => columns.find(({title}) => title), [columns]);
    const noteColumn = useMemo(() => columns.find(({note}) => note), [columns]);
    const imgColumn = useMemo(() => columns.find(({bgImg}) => bgImg), [columns]);
    const logoColumn = useMemo(() => columns.find(({logo}) => logo), [columns]);

    const title = useMemo(() => data?.[0]?.[titleColumn?.name], [data, titleColumn]);
    const note = useMemo(() => data?.[0]?.[noteColumn?.name], [data, noteColumn]);
    const bgImg = useMemo(() => data?.[0]?.[imgColumn?.name], [data, imgColumn]);
    const logo = useMemo(() => data?.[0]?.[logoColumn?.name], [data, imgColumn]);
    const chain = getChain(dataItems, item);

    return <Header title={title || display.defaultTitle}
                   note={note || display.defaultNote}
                   logo={logo}
                   bgImg={bgImg || display.defaultBgImg}
                   {...display}
                   chain={chain}
                   app={app}
                   type={type}
    />
}

export default {
    "name": 'Header: MNY',
    "type": 'Header',
    useDataSource: true,
    defaultState: {
        // user controlled part
        columns: [],
        display: {
            allowSearchParams: false,
            usePagination: true,
            pageSize: 5,
            totalLength: 0,
            overlay: 'overlay',
            showBreadcrumbs: true,
            titleSize: 'sm:text-[72px] tracking-[0px]'
        },
        // wrapper controlled part
        dataRequest: {},
        data: [],
        sourceInfo: {
            columns: []
        }
    },
    controls: {
        columns: [
            {
                type: 'toggle',
                label: 'Title',
                key: 'title',
                onChange: ({key, value, attribute, state, columnIdx}) => {
                    // turn off other title columns
                    state.columns.forEach(column => {
                        // if Title true, for original column set to true. for others false.
                        column.title = value ? column.name === attribute.name : value;
                        // show should only be set for title and note columns
                        column.show = column.name === attribute.name ? value : (column.note || column.bgImg || column.logo);
                    })}
            },
            {
                type: 'toggle',
                label: 'Note',
                key: 'note',
                onChange: ({key, value, attribute, state, columnIdx}) => {
                    // turn off other note columns
                    state.columns.forEach(column => {
                        // if note true, for original column set to true. for others false.
                        column.note = value ? column.name === attribute.name : value;
                        // show should only be set for title and note columns
                        column.show = column.name === attribute.name ? value : (column.title || column.bgImg || column.logo);
                    })}
            },
            {
                type: 'toggle',
                label: 'Image',
                key: 'bgImg',
                onChange: ({key, value, attribute, state, columnIdx}) => {
                    // turn off other note columns
                    state.columns.forEach(column => {
                        // if note true, for original column set to true. for others false.
                        column.bgImg = value ? column.name === attribute.name : value;
                        // show should only be set for title and note columns
                        column.show = column.name === attribute.name ? value : (column.title || column.note || column.logo);
                    })}
            },
            {
                type: 'toggle',
                label: 'Logo',
                key: 'logo',
                onChange: ({key, value, attribute, state, columnIdx}) => {
                    // turn off other note columns
                    state.columns.forEach(column => {
                        // if logo true, for original column set to true. for others false.
                        column.logo = value ? column.name === attribute.name : value;
                        // show should only be set for title and note columns
                        column.show = column.name === attribute.name ? value : (column.title || column.note || column.bgImg);
                    })}
            },
            {type: 'toggle', label: 'Filter', key: 'filters', trueValue: [{type: 'internal', operation: 'filter', values: []}]},
        ],
        more: [
            {type: 'toggle', label: 'Attribution', key: 'showAttribution'},
            {type: 'toggle', label: 'Breadcrumbs', key: 'showBreadcrumbs'},
            {type: 'toggle', label: 'Search', key: 'showSearchBar'},
            {type: 'select', label: 'Overlay', key: 'overlay',
                options: [
                    { label: 'Overlay', value: 'overlay' },
                    { label: 'Inset', value: 'inset' },
                    { label: 'Full Width', value: 'full' },
                    { label: 'No Image', value: 'none' }
                ]},
            {type: 'select', label: 'Title Size', key: 'titleSize',
                options: [
                    { label: 'Regular', value: 'sm:text-[48px] tracking-[-2px]' },
                    { label: 'Large', value: 'sm:text-[72px] tracking-[0px]' },
                ]},
            {type: 'input', inputType: 'text', label: 'Default Title', key: 'defaultTitle'},
            {type: 'input', inputType: 'text', label: 'Default Note', key: 'defaultNote'},
            {type: 'select', label: 'Default Image', key: 'defaultBgImg',   options: [{label: '', value: undefined}, ...overlayImageOptions, ...insetImageOptions]}
        ]
    },
    "EditComp": HeaderWrapper,
    "ViewComp": HeaderWrapper
}