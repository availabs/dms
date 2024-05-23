import React, { Fragment, useState, useLayoutEffect } from "react"
import { useLocation } from 'react-router-dom';
import isEqual from 'lodash/isEqual'
import cloneDeep from 'lodash/cloneDeep'
import { Popover, Transition } from '@headlessui/react'
import { Link } from "react-router-dom";
import { usePopper } from 'react-popper'
import { CMSContext } from '../../siteConfig'
import { getSizeClass, sizeOptionsSVG } from './sizes.jsx'

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

function SectionEdit ({value, i, onChange, attributes, size, onCancel, onSave, onRemove}) {
    let [referenceElement, setReferenceElement] = useState()
    let [popperElement, setPopperElement] = useState()
    let { styles, attributes:popperAttributes } = usePopper(referenceElement, popperElement)

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
        <div className={`${i === 0 ? '' : 'pt-4'}`}>
            <div className='flex flex-col'>
                <div className='flex flex-wrap border-y justify-end items-center'>
                    <div className='flex-0 grow'>
                        <TitleComp //todo make it blue if H!
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
                    <div>
                        <LevelComp 
                            className='p-2 w-20 bg-white'
                            value={value?.['level']}
                            placeholder={'level'}
                            options={attributes.level.options}
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
                   {/* <div>
                        <ReqsComp 
                            className='p-2 flex-0'
                            value={value?.['requirements']}
                            placeholder={'Add Reqs...'}
                            options={attributes?.requirements?.options}
                            onChange={(v) => updateAttribute('requirements', v)}
                        />
                    </div>*/}
                </div>
                <div className='flex flex-wrap border-y justify-end items-center'>
                    
                    <div className={'self-center pl-2'}>
                        <SizeSelect 
                            size={value?.['size']} 
                            onChange={v => updateAttribute('size',v)}
                        />
                    </div>
                    <div className='flex-1'/>
                    <div className={'flex flex-row flex-wrap'}>
                        <div className='py-2'>
                           <Popover className="relative">
                                <Popover.Button
                                    ref={setReferenceElement}
                                    className={'pl-3  text-md cursor-pointer hover:text-blue-800 text-blue-500'}>
                                    <i className="fa fa-circle-info text-2xl fa-fw" title="Help"/>
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
                                        ref={setPopperElement}
                                        style={styles.popper}
                                        {...popperAttributes.popper}
                                        className="shadow-lg bg-white z-10 w-screen max-w-sm transform px-4 border border-blue-200 lg:max-w-3xl">
                                        
                                        <HelpComp
                                            value={value?.['helpText']}
                                            onChange={(v) => updateAttribute('helpText', v)}
                                        />
                                  </Popover.Panel>
                                </Transition>
                            </Popover>
                        </div>
                        <div className='py-2'>
                            <button
                                className={'pl-6 py-0.5 text-md cursor-pointer hover:text-red-500 text-slate-400'}
                                onClick={onRemove}
                            ><i className="fa-light fa-trash text-2xl fa-fw" title="Delete"/></button>
                        </div>
                        <div className='py-2'>
                            <button
                                className={'pl-6 py-0.5 text-md cursor-pointer hover:text-red-500 text-slate-400'}
                                onClick={onCancel}
                            ><i className="fa-light fa-xmark text-2xl fa-fw" title="Cancel"/></button>
                        </div>
                        {/*<div className='py-2'>
                            <button
                                id={'btn-copy-component'}
                                className={'' +
                                    'pl-6 py-0.5 text-md cursor-pointer flex items-center ' +
                                    'hover:text-blue-500 focus:text-green-400 text-slate-400'}
                                onClick={() => navigator.clipboard.writeText(JSON.stringify(value?.['element'] || '{}'))}
                            ><i className="fa-light fa-copy text-2xl fa-fw" title="Copy"/>  </button>
                        </div>*/}
                        <div className='py-2'>
                            <button
                                className={'pl-6 py-0.5 text-md cursor-pointer flex items-center hover:text-blue-500 text-slate-400'}
                                onClick={onSave}
                            ><i className="fa-light fa-floppy-disk text-2xl fa-fw" title="Save"/>  </button>
                        </div>
                    </div>
                </div>
            </div>
            <div>
                <ElementComp 
                    value={value?.['element']} 
                    onChange={(v) => updateAttribute('element', v)}
                    size={size}
                />
            </div>
        </div>
    )
}

function SectionView ({value,i, attributes, edit, onEdit, moveItem, addAbove}) {
    let [referenceElement, setReferenceElement] = useState()
    let [popperElement, setPopperElement] = useState()
    let { styles, attributes:popperAttributes } = usePopper(referenceElement, popperElement)
    const { baseUrl, user } = React.useContext(CMSContext)
    
    const hideDebug = true
    let TitleComp = attributes?.title?.ViewComp
    let TagsComp = attributes?.tags?.ViewComp 
    let ElementComp = attributes?.element?.ViewComp
    let HelpComp = attributes?.helpText?.ViewComp
    let sectionTitleCondition = value?.['title'] || value?.['tags'] ;// edit
    let helpTextCondition = value?.['helpText'];
    let interactCondition = false //typeof onEdit !== 'function' && value?.element?.['element-type']?.includes('Map:');
    let isTemplateSectionCondition = value?.element?.['template-section-id'];

    const element = React.useMemo(() => {
        // console.log('element',value.id, i)
        return <ElementComp value={value?.['element']} />
    }, 
    [value?.element, value?.id])
        
    return (
        <div className={`h-full ${hideDebug ? '' : 'border border-dashed border-blue-500'}`}>
            <div className={`flex w-full ${hideDebug ? '' : 'border border-dashed border-orange-500'}`}>
                <div className='flex-1'/>
                    {/* -------------------top line buttons ----------------------*/}
                    {value?.is_header && edit ?  <div className={`z-10 relative`}>
                        <div className={`absolute mr-16 right-[-60px] flex`}>
                            <button
                                        className={' flex items-center text-md cursor-pointer hover:text-blue-500 text-slate-400'}
                                        onClick={ onEdit }
                                    >
                                        <i className="fa-light fa-pencil text-xl fa-fw" title="Edit"></i>
                                       
                                    </button>
                        </div>
                    </div>
                    :
                    <div className={`z-10 relative`}>
                        <div className={`absolute mr-16 ${edit ? 'top-[-14px]' : '}top-[-6px]'} right-[-60px] flex`}> 
                            {edit && typeof onEdit === 'function' && !isTemplateSectionCondition ? (
                                <>
                                    <button 
                                        className={'flex items-center text-md cursor-pointer hover:text-blue-500 text-slate-400'}
                                        onClick={ () => moveItem(i,-1) }
                                    >
                                        <i className="fa-light fa-angle-up text-xl fa-fw" title="Move Up" />
                                       
                                    </button>
                                    <button className={'flex items-center text-md cursor-pointer hover:text-blue-500 text-slate-400'}
                                        onClick={ () =>  moveItem(i,1) }
                                    >
                                        <i className="fa-light fa-angle-down text-xl fa-fw" title="Move Down"/>
                                        
                                    </button>
                               
                                    <button
                                        className={' flex items-center text-md cursor-pointer hover:text-blue-500 text-slate-400'}
                                        onClick={ onEdit }
                                    >
                                        <i className="fa-light fa-pencil text-xl fa-fw" title="Edit"></i>
                                       
                                    </button>
                                    <button className={'text-lg cursor-pointer hover:text-blue-500 text-slate-400 pr-1'} onClick={addAbove}> 
                                        <i className="fal fa-circle-plus text-lg fa-fw" title="Add Section"></i>
                                    </button>
                                </>
                            ) : ''}
                    
                           
                            {/* i === 0 && user.authLevel > 5 && !value?.is_header ?  
                              <Link to={`${baseUrl}/${edit ? '' : 'edit/'}${item.url_slug}`}>
                                <i className={`fad ${edit ? 'fa-eye' : 'fa-edit'}  fa-fw flex-shrink-0 text-lg text-slate-400 hover:text-blue-500`}/>
                              </Link> : ''    
                            */}
                             {/*<div className='w-8'></div>*/}
                        </div>
                    </div>
                    }
                    {/* -------------------top line buttons ----------------------*/}
                </div>
                {
                    (sectionTitleCondition || helpTextCondition || interactCondition) &&
                    <div className={`flex w-full h-[50px] items-center ${(value?.['level']) === '1' ? `border-b` : ``} ${hideDebug ? '' : 'border border-dashed border-pink-500'}`}>

                        <div id={`#${value?.title?.replace(/ /g, '_')}`}
                             className={`flex-1 flex-row py-2  font-display font-medium uppercase scroll-mt-36 ${sectionTitleCondition ? '' : 'invisible'}`}>
                            <TitleComp
                                className={`w-full ${
                                    (value?.['level']) === '1' ? 
                                        `text-blue-500 font-bold text-xl tracking-wider py-1 pl-1` : 
                                        value?.['level'] === '2' ? 
                                            `text-lg tracking-wider` : 
                                            value?.['level'] === '3' ? 
                                            `text-md tracking-wide` : 
                                                ``}`}
                                value={value?.['title']}
                            />
                        </div>

                        <div className={`${sectionTitleCondition ? 'p2' : 'invisible'}`}>
                            <TagsComp
                                className=''
                                value={value?.['tags']}
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

                        <div className={`${helpTextCondition ? 'p-0.5' : 'hidden'}`}>
                            <Popover className="relative">
                                <Popover.Button
                                    ref={setReferenceElement}
                                    className={'pl-3  text-md cursor-pointer hover:text-blue-200 text-blue-500'}>
                                    <i className="fa fa-circle-info text-2xl fa-fw" title="Help"/>
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
                                        ref={setPopperElement}
                                        style={styles.popper}
                                        {...popperAttributes.popper}
                                        className="shadow-lg bg-white z-10 w-screen max-w-sm transform px-4 border border-blue-200 lg:max-w-3xl">
                                        
                                            <HelpComp
                                                value={value?.['helpText']}
                                            />
                                        


                                    </Popover.Panel>
                                </Transition>
                            </Popover>
                        </div>

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
            <div className='h-full'>
                {element}
            </div>
        </div>
    )
}  

const SectionViewMemo = React.memo(SectionView,
    (prev, next) => {
        //console.log('svm', prev.value.id, prev.i, isEqual(prev.value, next.value))
        return isEqual(prev.value, next.value)
})


const AddSectionButton = ({onClick, showpageToggle}) => {
    let item = {}
    let baseUrl = ''
    return (
        <div className='flex w-full'>
            <div className='flex-1'/>
            <div className={`z-10 relative ${showpageToggle ? 'w-12' : 'w-8'}`}>
                <div className='absolute mr-8 top-[-14px] flex'> 
                    <button 
                        className={'text-lg cursor-pointer hover:text-blue-500 text-slate-400'}
                        onClick={onClick}
                    > 
                    <i className="fal fa-circle-plus text-lg fa-fw" title="Add Section"></i>
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

const Edit = ({Component, value, onChange, attr, full_width = false }) => {
    if (!value || !value.map) { 
        value = []
    }
    // console.log('---------------sa edit render-----------------')
    // console.log('sa edit sections', value)
    // const [values, setValues] = React.useState([...value , ''] || [''])
    const values = [...value,'']
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
            cloneValue[edit.index] = edit.value

            action = `edited section ${edit?.value?.title ? `${edit?.value?.title} ${edit.index+1}` : edit.index+1}`
        } else {
            cloneValue.splice(edit.index, 0, edit.value)
            action = `added section ${edit?.value?.title ? `${edit?.value?.title} ${edit.index+1}` : edit.index+1}`
        }
        //console.log('edit on save', edit)
        cancel()
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
                        id={`${v.id}`}
                        className={`${v?.size ? "h-full" : ""} ${sizeClass} ${hideDebug ? '' : 'border-2 border-dashed border-green-500'}`}>
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

const View = ({Component, value, attr, full_width}) => {
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


    //console.log('render SA view', Component, value)

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
                    <div id={v.id} key={i} className={`${sizeClass}`}>
                        <SectionView
                            attributes={attr.attributes}
                            key={i}
                            i={i}
                            value={v}
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