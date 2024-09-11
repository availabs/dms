import React, {Fragment, useState, useLayoutEffect, useEffect} from "react"
import { useLocation } from 'react-router-dom';
import isEqual from 'lodash/isEqual'
import cloneDeep from 'lodash/cloneDeep'
import { Popover, Transition } from '@headlessui/react'
import { Link } from "react-router-dom";
import { usePopper } from 'react-popper'
import { FormsContext } from '../../'
import { getSizeClass, sizeOptionsSVG } from './sizes.jsx'
import { 
    SquarePlus, 
    InfoCircle,
    TrashCan,
    RemoveCircle,
    CancelCircle,
    FloppyDisk,
    CirclePlusDot,
    PencilSquare,
    ArrowDownSquare,
    ArrowUpSquare,
    ChevronDownSquare,
    ChevronUpSquare,
    InfoSquare,
    MoreSquare
} from '../../ui/icons'

const isJson = (str)  => {
    try {
        JSON.parse(str);
    } catch (e) {
        return false;
    }
    return true;
}

function SizeSelect ({size='1', setSize, onChange}) {
    
    return (
        <div
          className="flex space-x-1 rounded-lg bg-blue-50 p-0.5"
          role="tablist"
          aria-orientation="horizontal"
        >        
        {sizeOptionsSVG.map((s,i) => (
            <button
                key={i}
                className={
                    s.name === size ?
                    "flex items-center rounded-md py-[0.4375rem] pl-2 pr-2 text-sm font-semibold lg:pr-3 bg-white shadow" :
                    "flex items-center rounded-md py-[0.4375rem] pl-2 pr-2 text-sm font-semibold lg:pr-3 hover:text-blue-500"
                }
                id="headlessui-tabs-tab-3"
                role="tab"
                type="button"
                tabIndex={-1}
                onClick={() => {
                    onChange(s.name) 
                }}
              >
                
                {s.icon}
              </button>
        ))}
        </div>
    )
} 

const RenderError = ({data}) => (
    <div className={'p-2 rounded-md bg-red-300 border-red-500 text-white min-h-[50px]'}>
        Error: {data?.status}
    </div>)

function SectionEdit ({value, i, onChange, attributes, size, onCancel, onSave, onRemove, format, apiLoad, apiUpdate}) {
    let sectionTitleCondition = value?.['title'] 
    let {theme} = React.useContext(FormsContext) || {}

    const updateAttribute = (k, v) => {
        if(!isEqual(value, {...value, [k]: v})) {
            onChange({...value, [k]: v})
        }
    }

    let TitleComp = attributes?.title?.EditComp
    let LevelComp = attributes?.level?.EditComp
    let TagsComp = attributes?.tags?.EditComp
    let ElementComp = attributes?.element?.EditComp
    let HelpComp = attributes?.helpText?.EditComp

    return (
        <div className={``}>
            {/* -------------------top line buttons ----------------------*/}
            <div className={`flex w-full`}>
                <div className='flex-1'/>
                    <div className={`z-10 relative`}>
                        <div className={`absolute mr-16 top-[-14px] right-[-60px] flex`}>    
                            <Popover className="relative">
                                <Popover.Button  className={'flex items-center cursor-pointer pt-1 pr-1'} >
                                    <InfoSquare className='text-blue-400 hover:text-blue-600  w-[24px] h-[24px]' title="Move Up"/>
                                </Popover.Button>
                                <Transition
                                    as={Fragment}
                                    enter="transition ease-out duration-200"
                                    enterFrom="opacity-0 translate-y-1"
                                    enterTo="opacity-100 translate-y-0"
                                    leave="transition ease-in duration-150"
                                    leaveFrom="opacity-100 translate-y-0"
                                    leaveTo="opacity-0 translate-y-1"
                                >
                                    <Popover.Panel 
                                        anchor="bottom"
                                        className="absolute shadow-lg bg-white z-10 w-screen max-w-sm transform px-4 border border-blue-200 lg:max-w-lg">
                                        
                                        <HelpComp
                                            value={value?.['helpText']}
                                            onChange={(v) => updateAttribute('helpText', v)}
                                        />
                                  </Popover.Panel>
                                </Transition>
                            </Popover>
                            <button className={'flex items-center text-md cursor-pointer pr-1'}
                                onClick={ onRemove }
                            >
                                {/*<i className="fa-light fa-angle-down text-xl fa-fw" title="Move Down"/>*/}
                                <TrashCan className='text-slate-400 hover:text-red-500 w-[24px] h-[24px]' title="Move Down"/>
                            </button>
                       
                            <button
                                className={' flex items-center text-md cursor-pointer  py-1 pr-1 text-slate-400'}
                                onClick={ onCancel }
                            >
                                {/*<i className="fa-light fa-pencil text-xl fa-fw" title="Edit"></i>*/}
                                <CancelCircle className='text-slate-400 hover:text-red-500 w-[24px] h-[24px]'/>
                               
                            </button>
                            <button className={'text-lg cursor-pointer hover:text-blue-500 text-slate-400 pr-1'} onClick={onSave}> 
                                <FloppyDisk className='text-slate-400 hover:text-blue-500 w-[24px] h-[24px]'/>
                            </button>
                             <Popover className="relative">
                                <Popover.Button className={'flex items-center cursor-pointer pt-1 pr-1'} >
                                    <MoreSquare className='text-blue-400 hover:text-blue-600  w-[24px] h-[24px]' title="Move Up"/>
                                </Popover.Button>
                                <Transition
                                    as={Fragment}
                                    enter="transition ease-out duration-200"
                                    enterFrom="opacity-0 translate-y-1"
                                    enterTo="opacity-100 translate-y-0"
                                    leave="transition ease-in duration-150"
                                    leaveFrom="opacity-100 translate-y-0"
                                    leaveTo="opacity-0 translate-y-1"
                                >
                                    <Popover.Panel
                                        anchor="bottom"
                                        className="fixed right-0 lg:absolute lg:left-[35px] lg:top-[14px] shadow bg-blue-50 z-10 w-[280px] min-h-[250px] z-40 rounded border border-blue-300 transform px-4">
                                        
                                        <div className='flex flex-col'>
                                            <div className='flex-0 grow'>
                                                <TitleComp //todo make it blue if H!
                                                    className={`${theme?.heading?.base} ${theme?.heading[value?.['level']] || theme?.heading['default']}`}
                                                    placeholder={'Section Title'}
                                                    value={value?.['title']} 
                                                    onChange={(v) => updateAttribute('title', v)}
                                                />
                                            </div>
                                            <div>
                                                <LevelComp 
                                                    className='p-2 w-full bg-transparent'
                                                    value={value?.['level']}
                                                    placeholder={'level'}
                                                    options={attributes.level?.options}
                                                    onChange={(v) => updateAttribute('level', v)}
                                                />
                                            </div>
                                            <div>
                                                <TagsComp 
                                                    className='p-2 flex-0'
                                                    value={value?.['tags']}
                                                    placeholder={'Add Tag...'} 
                                                    onChange={(v) => updateAttribute('tags', v)}
                                                />
                                            </div>
                                            <div className={'self-center pl-2'}>
                                                <SizeSelect 
                                                    size={value?.['size']} 
                                                    onChange={v => updateAttribute('size',v)}
                                                />
                                            </div>
                                        </div>
                                  </Popover.Panel>
                                </Transition>
                            </Popover>
                        </div>
                    </div>
                </div>    
            {sectionTitleCondition && (
                <div className='flex h-[50px]'>
                    <div className='flex'>
                        <TitleComp
                            className={`p-2 w-full font-sans font-medium text-md  ${
                                (value?.['level']) === '1' ?
                                    `text-blue-500 font-bold text-xl tracking-wider py-1 pl-1` :
                                    value?.['level'] === '2' ?
                                        `text-lg tracking-wider` :
                                        value?.['level'] === '3' ?
                                            `text-md tracking-wide` :
                                            ``}`}
                            placeholder={'Section Title'}
                            value={value?.['title']} 

                            onChange={(v) => updateAttribute('title', v)}
                        />
                    </div>
                </div>
            )}
            <div className={'border border-orange-500'}>
                <ElementComp
                    value={value?.['element']}
                    onChange={(v) => updateAttribute('element', v)}
                    size={size}
                    format={format}
                    apiLoad={apiLoad}
                    apiUpdate={apiUpdate}
                />
            </div>
        </div>
    )
}

function SectionView ({value,i, attributes, edit, onEdit, moveItem, addAbove, format, apiLoad, apiUpdate}) {
    let [referenceElement, setReferenceElement] = useState()
    let [popperElement, setPopperElement] = useState()
    let { styles, attributes:popperAttributes } = usePopper(referenceElement, popperElement)
    const { baseUrl, user, theme } = React.useContext(FormsContext) || {}
    
    const hideDebug = true
    let TitleComp = attributes?.title?.ViewComp
    let TagsComp = attributes?.tags?.ViewComp 
    let ElementComp = attributes?.element?.ViewComp
    let HelpComp = attributes?.helpText?.ViewComp
    let sectionTitleCondition = value?.['title']  //|| value?.['tags'] ;// edit
    let helpTextCondition = value?.['helpText'];
    let interactCondition = false //typeof onEdit !== 'function' && value?.element?.['element-type']?.includes('Map:');
    let isTemplateSectionCondition = value?.element?.['template-section-id'];
    let showEditIcons = edit && typeof onEdit === 'function' && !isTemplateSectionCondition

    //console.log('test xyz', value?.['helpText'], typeof value?.['helpText'], value?.['helpText']?.length )

    const element = React.useMemo(() => {
        // console.log('element',value.id, i)
        return <ElementComp value={value?.['element']} format={format} apiLoad={apiLoad} apiUpdate={apiUpdate}/>
    }, 
    [value?.element, value?.id])

    //console.log('element test 123', value.element, value.id)
        
    return (
        <div className={`h-full ${hideDebug ? '' : ''}`}>
            {/* -------------------top line buttons ----------------------*/}
            <div className={`flex w-full ${hideDebug ? '' : ''}`}>
                <div className='flex-1'/>
                    
                    {value?.is_header && edit ?  <div className={`z-10 relative ${hideDebug ? '': ''}`}>
                        <div className={`absolute mr-16 right-[-60px] flex`}>
                            <button
                                className={' flex items-center text-md cursor-pointer hover:text-blue-500 text-slate-400'}
                                onClick={ onEdit }
                            >
                                {/*<i className="fa-light fa-pencil text-xl fa-fw" title="Edit"></i>*/}
                                <PencilSquare className='text-slate-400 hover:text-blue-500'/>
                               
                            </button>
                        </div>
                    </div>
                    :
                    <div className={`z-10 relative`}>
                        <div className={`absolute mr-16 top-[-14px] right-[-60px] flex items-center h-[32px]`}> 
                            
                                
                                    {helpTextCondition && <Popover className="relative pr-1 h-[24px]">
                                        <Popover.Button
                                            
                                            className={' cursor-pointer '}>
                                            {/*<i className="fa fa-circle-info text-2xl fa-fw" title="Help"/>*/}
                                            <InfoSquare className='text-blue-400 hover:text-blue-500 w-[24px] h-[24px]' title="Move Up"/>
                                        </Popover.Button>
                                        <Transition
                                            as={Fragment}
                                            enter="transition ease-out duration-200"
                                            enterFrom="opacity-0 translate-y-1"
                                            enterTo="opacity-100 translate-y-0"
                                            leave="transition ease-in duration-150"
                                            leaveFrom="opacity-100 translate-y-0"
                                            leaveTo="opacity-0 translate-y-1"
                                        >
                                            <Popover.Panel 
                                                
                                                
                                                className="absolute shadow bg-white z-10 w-screen max-w-sm transform px-4 border border-blue-200 lg:max-w-lg">
                                                
                                                    <HelpComp
                                                        value={value?.['helpText']}
                                                    />
                                                


                                            </Popover.Panel>
                                        </Transition>
                                    </Popover>}
                                    {showEditIcons && (
                                        <>
                                            <button 
                                                className={'flex items-center text-md cursor-pointer hover:text-blue-500 text-slate-400 pr-1'}
                                                onClick={ () => moveItem(i,-1) }
                                            >
                                                {/*<i className="fa-light fa-angle-up text-xl fa-fw"  />*/}
                                                <ChevronUpSquare className='text-slate-400 hover:text-blue-500 w-[24px] h-[24px]' title="Move Up"/>
                                               
                                            </button>
                                            <button className={'flex items-center text-md cursor-pointer hover:text-blue-500 text-slate-400 pr-1'}
                                                onClick={ () =>  moveItem(i,1) }
                                            >
                                                {/*<i className="fa-light fa-angle-down text-xl fa-fw" title="Move Down"/>*/}
                                                <ChevronDownSquare className='text-slate-400 hover:text-blue-500 w-[24px] h-[24px]' title="Move Down"/>
                                            </button>
                                       
                                            <button
                                                className={' flex items-center text-md cursor-pointer hover:text-blue-500 py-1 pr-1 text-slate-400'}
                                                onClick={ onEdit }
                                            >
                                                {/*<i className="fa-light fa-pencil text-xl fa-fw" title="Edit"></i>*/}
                                                <PencilSquare className='text-slate-400 hover:text-blue-500 w-[24px] h-[24px]'/>
                                               
                                            </button>
                                            <button className={'text-lg cursor-pointer hover:text-blue-500 text-slate-400 pr-3'} onClick={addAbove}> 
                                                <SquarePlus className='text-slate-400 hover:text-blue-500 w-[24px] h-[24px]'/>
                                            </button>
                                        </>
                                    )}
                                
                            
                    
                         
                        </div>
                    </div>
                    }
                   
                </div>
                {/* -------------------END top line buttons ----------------------*/}
                {/* -------------------Section Header ----------------------*/}
                {
                    (sectionTitleCondition || interactCondition) &&
                    <div className={`flex w-full h-[50px] items-center ${(value?.['level']) === '1' ? `border-b` : ``} ${hideDebug ? '' : 'border border-dashed border-pink-500'}`}>

                        <div id={`#${value?.title?.replace(/ /g, '_')}`}
                             className={`flex-1 flex-row py-2  font-display font-medium uppercase scroll-mt-36 ${sectionTitleCondition ? '' : 'invisible'}`}>
                            <TitleComp
                                className={`w-full ${theme.heading[value?.['level']] || theme.heading['default']}`}
                                value={value?.['title']}
                            />
                        </div>


                        {
                            value?.element?.['element-type']?.includes('Map:') &&
                            <Link
                                className={`${interactCondition ? 'pl-6 py-0.5 text-md cursor-pointer hover:text-blue-500 text-slate-400' : 'hidden'}`}
                                to={`/interact/${value?.id}`}
                                title={'interact'}>
                                <i className={'fa-light fa-window-restore'}/>
                            </Link>
                        }

                        { sectionTitleCondition && typeof onEdit === 'function' && !isTemplateSectionCondition ?
                            <>
                                {/*<div className='py-2'>
                                    <button
                                        className={'pl-3 flex items-center text-md cursor-pointer hover:text-blue-500 text-slate-400'}
                                        onClick={ () => moveItem(i,-1) }
                                    >
                                        <i className="fa-light fa-angle-up text-xl fa-fw" title="Move Up"></i>
                                        {
                                    </button>

                                </div>
                                <div className='py-2'>
                                    <button
                                        className={'pl-3  flex items-center text-md cursor-pointer hover:text-blue-500 text-slate-400'}
                                        onClick={ () =>  moveItem(i,1) }
                                    >
                                        <i className="fa-light fa-angle-down text-xl fa-fw" title="Move Down"></i>
                                       

                                </div>
                                <div className='py-2'>
                                    <button
                                        className={'pl-6 py-0.5 flex items-center text-md cursor-pointer hover:text-blue-500 text-slate-400'}
                                        onClick={ onEdit }
                                    >
                                        <i className="fa-light fa-pencil text-xl fa-fw" title="Edit"></i>
                                        
                                    </button>

                                </div>*/}
                            </> :
                            isTemplateSectionCondition && typeof onEdit === 'function'?
                                <i className={'pl-5 py-0.5 fa-light fa-lock p-2 text-slate-400'} title={'Template generated section'}/> : <></>
                        }
                    </div>

                }
            {/* -------------------END Section Header ----------------------*/}
            <div className={`h-full ${hideDebug ? '' : 'border border-dashed border-orange-500'}`}>
                {element}
            </div>
        </div>
    )
}  

// const SectionViewMemo = React.memo(SectionView,
//     (prev, next) => {
//         //console.log('svm', prev.value.id, prev.i, isEqual(prev.value, next.value))
//         return isEqual(prev.value, next.value)
// })


const AddSectionButton = ({onClick, showpageToggle}) => {
    let item = {}
    let baseUrl = ''
    return (
        <div className='flex w-full'>
            <div className='flex-1'/>
            <div className={`z-10 relative ${showpageToggle ? 'w-12' : 'w-8'}`}>
                <div className='absolute right-[14px] top-[-9px] flex'> 
                    <button 
                        className={'cursor-pointer pr-0.5'}
                        onClick={onClick}
                    > 
                    {/*<i className="fal fa-circle-plus text-lg fa-fw" title="Add Section"></i>*/}
                    <SquarePlus className='w-[24px] h-[24px] hover:text-blue-500 text-slate-400'/>
                    {/*☷ Add Section*/}
                    </button>
                    {/*showpageToggle ?  
                      <Link to={`${baseUrl}/${item.url_slug}`}>
                        <i className='fad fa-eye fa-fw flex-shrink-0 text-lg text-slate-400 hover:text-blue-500'/>
                      </Link> : ''    
                    */}
                </div>
            </div>
        </div>
    )
}

const ScrollToHashElement = () => {
    const location = useLocation();

    useLayoutEffect(() => {
        const { hash } = location;
        const removeHashCharacter = (str) => {
            const result = str.slice(1);
            return +result;
        };

        if (hash) {
            const element = document.getElementById(removeHashCharacter(hash));
            if (element) {
                let position = element.getBoundingClientRect();
                setTimeout(function () {
                    window.scrollTo(position.x, position.y - 170);
                    // element.scrollIntoView({
                    //     behavior: "smooth",
                    //     block: "center",
                    // });
                }, 100);
            }
        }
    }, [location]);

    return null;
};

const Edit = ({Component, value, onChange, attr, full_width = false, format, apiLoad, apiUpdate, ...rest }) => {
    //console.log('.............', rest, attr, value)
    if (!value || !value.map) { 
        value = []
    }
    // console.log('---------------sa edit render-----------------')
    // console.log('sa edit sections', value)
    // const [values, setValues] = React.useState([...value , ''] || [''])
    const [values, setValues] = useState([]);

    useEffect(() => {
        if(JSON.stringify(values) === JSON.stringify([...value,''])) return;
        setValues([...value,''])
    }, [value]);
    const [edit, setEdit] = React.useState({
        index: -1,
        value: '',
        type: 'new'
    })

    const setEditValue = (v) => setEdit({...edit, value: v})
    const setEditIndex = (i) => setEdit({...edit, index: i})
    
    const cancel = () => {
       setEdit({index: -1, value:'',type:'new'}) 
    }

    const save = () => {
        let cloneValue = cloneDeep(value)
        let action = ''
        // edit.value.has_changes = true
        if(edit.type === 'update') {
            // values.splice()
            cloneValue[edit.index] = edit.value

            action = `edited section ${edit?.value?.title ? `${edit?.value?.title} ${edit.index+1}` : edit.index+1}`
        } else {
            cloneValue.splice(edit.index, 0, edit.value)
            action = `added section ${edit?.value?.title ? `${edit?.value?.title} ${edit.index+1}` : edit.index+1}`
        }
        //console.log('edit on save', edit)
        cancel()
        setValues([...cloneValue, ''])
        onChange(cloneValue,action)
    }

    const remove = () => {
        let cloneValue = cloneDeep(value)
        
        if(edit.type === 'update') {
            cloneValue.splice(edit.index, 1)
        }
        // console.log('value', value, cloneValue)
        // console.log('edit on remove', edit)
        cancel()
        onChange(cloneValue, `removed section ${edit?.value?.title ? `${edit?.value?.title} ${edit.index+1}` : edit.index+1}`)
    }

    const update = (i) => {
        setEdit({index: i, value:value[i],type:'update'})
    }

    function moveItem(from, dir) {
        let cloneValue = cloneDeep(value)
        // remove `from` item and store it
        let to = from + dir
        
        if(to < 0 || to >= cloneValue.length){
            return
        }
        var f = cloneValue.splice(from, 1)[0];
        // insert stored item into position `to`
        cloneValue.splice(to, 0, f);
        onChange(cloneValue)
    }
    let runningColTotal = 8;
    const hideDebug = true
    
    // each component should have md and lg col-start- class
    // 1 row can fit different components totaling in size 1 OR one component with size 1 or 2
    // col-start for md and lg depends upon previous components from the same row
    // every time component size total reaches 1, row changes


    const layouts = {
        centered: 'md:grid-cols-[1fr_repeat(6,_minmax(_100px,_170px))_1fr]',
        fullwidth:'md:grid-cols-[_minmax(_0px,0px)_repeat(6,_1fr)_minmax(_0px,0px)]'
    }

    
    return (
        <div className={`w-full grid grid-cols-6 ${layouts[full_width === 'show' ? 'fullwidth' : 'centered']} gap-1`}>
            <ScrollToHashElement />
            {values.map((v,i) => {
                //console.log()
                const size = (edit.index === i ? edit?.value?.size : v?.size) || "1";
                const requiredSpace = sizeOptionsSVG.find(s => s.name === size)?.value;
                const availableSpace = 6 - runningColTotal;

                if(runningColTotal === 0){
                    runningColTotal = requiredSpace
                }else if(requiredSpace <= availableSpace){
                    runningColTotal += requiredSpace
                }else{
                    runningColTotal = requiredSpace
                }

                const sizeClass = getSizeClass(size, requiredSpace, availableSpace, runningColTotal);

                // console.log('section', v, v.error)
                return (
                    <div
                        key={i}
                        id={`${v?.id}`}
                        className={`${v?.size ? "h-full" : ""} ${sizeClass} ${hideDebug ? '' : 'border border-green-500'}`}>
                        {/* add to top */}
                        { /*edit.index === -1 && i === 0 ? 
                            <AddSectionButton showpageToggle={true} onClick={() => setEditIndex(0)}/> : 
                                edit.index === -1 || i > 0 ? '' : <div className='' />
                        */ }

                        {/* edit new or existing section */}
                        {edit.index === i 
                            ? <SectionEdit 
                                value={edit.value} 
                                onChange={setEditValue}
                                onSave={save}
                                onCancel={cancel}
                                onRemove={remove}
                                attributes={attr.attributes}
                                size={size}
                                i={i}
                                format={format}
                                apiLoad={apiLoad}
                                apiUpdate={apiUpdate}
                            />
                            : ''
                        }
                        
                        {/* show section if not being edited */}
                        { v !== '' && !(edit.index === i && edit.type === 'update') && (!v?.status || v?.status === 'success') ?
                            <SectionView
                                value={v} 
                                i={i}
                                moveItem={moveItem}
                                attributes={attr.attributes}
                                edit={true}
                                onEdit={ edit.index === -1 ? (e) => update(i)  : null }
                                addAbove={() => setEditIndex(i)}
                                format={format}
                                apiLoad={apiLoad}
                                apiUpdate={apiUpdate}
                            /> : v?.status?.length > 1 ? <RenderError data={v} /> : ''}

                        {/* add new section at end  */}
                        { !values[0]?.is_header && edit.index == -1 && i === values.length-1 ? 
                            <div className=''>
                                <AddSectionButton onClick={() => setEditIndex(i)}/> 
                            </div>  : <div className='' />
                        }
                    </div>
                )
            })
        }
        </div>
    )
}

const View = ({Component, value, attr, full_width, format, apiLoad, apiUpdate}) => {
    if (!value || !value.map) { return '' }
    let runningColTotal = 8;
    let layouts = {
        centered: 'md:grid-cols-[1fr_repeat(6,_minmax(_100px,_170px))_1fr]',
        fullwidth:'md:grid-cols-[_minmax(_0px,0px)_repeat(6,_1fr)_minmax(_0px,0px)]'
    }
    const hideSectionCondition = section => {
        //console.log('hideSectionCondition', section?.element?.['element-data'] || '{}')
        let value = section?.element?.['element-data']
        let elementData = typeof value === 'object' ?
            value : value && isJson(value) ? JSON.parse(value) : {}
        return !elementData?.hideSection
    }


    console.log('render SA view', full_width)

    return (
        <div className={`w-full grid grid-cols-6 ${layouts[full_width === 'show' ? 'fullwidth' : 'centered']} gap-1`}>
        { 
            value.filter(v => hideSectionCondition(v))
                .map((v,i) =>{
                const size = v?.size || "1";
                const requiredSpace = sizeOptionsSVG.find(s => s.name === size)?.value;
                const availableSpace = 6 - runningColTotal;

                if(runningColTotal === 0){
                    runningColTotal = requiredSpace
                }else if(requiredSpace <= availableSpace){
                    runningColTotal += requiredSpace
                }else{
                    runningColTotal = requiredSpace
                }

                const sizeClass = getSizeClass(size, requiredSpace, availableSpace, runningColTotal);

                return (
                    <div id={v?.id} key={i} className={`${sizeClass}`}>
                        <SectionView
                            attributes={attr.attributes}
                            key={i}
                            i={i}
                            value={v}
                            format={format}
                            apiLoad={apiLoad}
                            apiUpdate={apiUpdate}
                        />
                    </div>
                )
            })
        }
        <ScrollToHashElement />
        </div>
    )
}

export default {
    "EditComp": Edit,
    "ViewComp": View
}