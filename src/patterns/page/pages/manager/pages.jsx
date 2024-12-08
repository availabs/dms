import React, {Fragment, useRef, useState} from 'react'
import {NavLink, useSubmit, useLocation} from "react-router-dom";
import Nestable from '../../ui/nestable';
import {CancelCircle, ViewIcon} from '../../ui/icons';
import {json2DmsForm, getUrlSlug} from '../_utils'
import {CMSContext} from '../../siteConfig'

const theme = {
    nav: {
        container: (open) => `w-1/3 border-2 border-teal-400 overflow-hidden`,
        navItemContainer: 'max-h-[80vh] w-full border-l overflow-y-auto overflow-x-hidden pt-3 scrollbar-xs',
        navItem: ({isActive, isPending}) =>
            `block px-4 py-2 font-light ${isActive ?
                'w-[256px] bg-white text-blue-500 border-l border-y' :
                'w-[248px] hover:bg-blue-100 text-slate-600'
            }`,
        navItemChild: ({isActive, isPending}) =>
            `block px-4 py-2 font-light ${isActive ?
                'w-[238px] bg-white text-blue-500 border-l border-y' :
                'w-[230px] hover:bg-blue-100 text-slate-600'
            }`,
        addItemButton: 'cursor-pointer px-4 py-2 mt-3 hover:bg-blue-100 w-full text-slate-400 border-t border-slate-200',
        expandCollapseButton: 'p-0.5 rounded-md text-white bg-blue-300 hover:bg-blue-600'
    },
  page: {
    pageContainer: 'border-2 border-red-500 max-h-[80vh] w-2/3 overflow-y-auto overflow-x-hidden pt-3 scrollbar-xs',
  }
}

// ==================================================== util fns begin =================================================
function AddItemButton({dataItems}) {
    const submit = useSubmit();
    const {pathname = '/edit'} = useLocation();
    const {baseUrl, user} = React.useContext(CMSContext);

    const highestIndex = dataItems
        .filter(d => !d.parent)
        .reduce((out, d) => {
            return Math.max(isNaN(d.index) ? -1 : d.index, out)
        }, -1)

    const item = {
        title: 'New Page',
        index: highestIndex + 1,
        published: 'draft',
        history: [{
            type: ' created Page.',
            user: user.email,
            time: new Date().toString()
        }]
    }
    item.url_slug = getUrlSlug(item, dataItems)

    const addItem = () => {
        submit(json2DmsForm(item), {method: "post", action: pathname})
    }
    return (
        <div className='pr-2'>
            <div
                onClick={addItem}
                className={theme.nav.addItemButton}
            >
                + Add Page
            </div>
        </div>
    )
}

function updateNav(items, parentId = '', dataItemsHash) {
    // recursive depth nav updater
    let updates = []
    items.forEach((newItem, i) => {
        let orig = dataItemsHash[newItem.id]
        const update = {id: orig.id, index: orig.index, title: orig.title, url_slug: orig.url_slug}//
        if (orig.index !== i || orig.parent !== parentId) {
            update.index = i
            update.parent = parentId
            updates.push(update)
        }
        if (newItem.children) {
            updates = [...updates, ...updateNav(newItem.children, newItem.id, dataItemsHash)]
        }
    })
    return updates
}

const getExpandableItems = (items) => items.reduce((acc, curr) => curr.children ? [...acc, curr.id, ...getExpandableItems(curr.children)] : acc, [])

// ==================================================== util fns end ===================================================

function Nav({item, dataItems, edit, open, setOpen, selectedPage, setSelectedPage}) {
    const submit = useSubmit()
    const {pathname = '/edit'} = useLocation()
    const {baseUrl} = React.useContext(CMSContext)
    const [expandedItems, setExpandedItems] = useState({});
    const nestableRef = useRef(null);

    const toggleExpand = (id) => {
        setExpandedItems((prevState) => ({
            ...prevState,
            [id]: !prevState[id], // Toggle expand/collapse for the clicked item
        }));
    };

    const onDragEnd = React.useCallback(result => {
        let dataItemsHash = dataItems.reduce((out, curr) => {
            out[curr.id] = curr
            return out
        }, {})

        let updates = updateNav(result.items, '', dataItemsHash)

        // need non updated items
        // to determine new slug names
        let newItems = [
            ...updates,
            ...dataItems.filter(d => !updates.map(i => i.id).includes(d.id))
        ]

        updates.forEach((item) => item.url_slug = getUrlSlug(item, newItems))

        //---------------------------------
        //send updates to API
        //---------------------------------
        Promise.all(
            updates.map((item) => {
                submit(json2DmsForm(item), {method: "post", action: pathname})
            }))//.then(values => {console.log('updating nav', values)})
    }, []);


    const mapDataItemToItem = (d, i) => {
        let item = {
            id: d.id,
            index: d.index,
            title: d.title,
            has_changes: d.has_changes
        }
        if (getChildNav(item, dataItems)) {
            item.children = getChildNav(d, dataItems)
        }
        console.log('----------', selectedPage, item.id,
            dataItems.find(dI => dI.id === selectedPage)
            )

        item.Comp = ({isExpanded, hasChanges, isSelectedPage}) => {
            return (
                <div key={item.id}
                     className={`px-1 flex items-center gap-1 cursor-pointer ${isSelectedPage ? `bg-gray-100` : ``} hover:bg-gray-100 rounded-md`}
                     onClick={() => {
                         toggleExpand(item.id)
                     }}>

                    {item.title}

                    <div className={`px-0.5 text-white text-xs ${hasChanges ? `bg-red-600` : `bg-blue-600`} rounded-lg`}>
                        {hasChanges ? 'unpublished' : 'published'}
                    </div>

                    {!item.children?.length ? '' : isExpanded ? `-` : '+'}

                    <ViewIcon onClick={e => {
                        e.stopPropagation();
                        setSelectedPage(item.id);
                    }} height={15} width={15} className={'text-gray-700 hover:text-gray-900'}/>

                    {/*{*/}
                    {/*    isExpanded && item.children?.length ? item.children.map(({Comp}) => <Comp/>) : null*/}
                    {/*}*/}
                </div>
            )
        };
        return item
    }

    function getChildNav(item, dataItems) {
        let children = dataItems
            .filter(d => d.parent === item.id)
            .sort((a, b) => a.index - b.index)

        if (children.length === 0) return false
        return children.map(mapDataItemToItem)
    }

    const items = dataItems
        .sort((a, b) => a.index - b.index)
        .filter(d => !d.parent && d.index !== '999')
        .map(mapDataItemToItem)

    const renderItem = (item) => {
        if (!item) return null;
        let Comp = item.Comp;
        const isExpanded = expandedItems[item.id];
        const hasChanges = item.has_changes === 'true';
        const isSelectedPage = selectedPage === item.id;
        return (
            <>
                <Comp isExpanded={isExpanded} hasChanges={hasChanges} isSelectedPage={isSelectedPage}/>
                {isExpanded ? <div className={'pl-5 border-l'}>{item.children.map(renderItem)}</div> : null}
            </>
        )
    }

    return (
        <>
            <div className={theme.nav.container(open)}>
                <div className={theme.nav.navItemContainer}>
                    <div className={'px-1 flex gap-1 w-full justify-end text-xs'}>
                        <button className={theme.nav.expandCollapseButton} onClick={() => setExpandedItems({})}>
                            Collapse All
                        </button>
                        <button className={theme.nav.expandCollapseButton}
                                onClick={() => setExpandedItems(getExpandableItems(items).reduce((acc, curr) => ({
                                    ...acc,
                                    [curr]: true
                                }), {}))}
                        >Expand All
                        </button>
                    </div>

                    <Nestable
                        ref={nestableRef}
                        items={items}
                        collapsed={true}
                        onChange={onDragEnd}
                        maxDepth={4}
                        renderItem={({item}) => renderItem(item)}
                    />

                    {edit && <AddItemButton dataItems={dataItems}/>}
                </div>
            </div>
            {/*<div className={`${open ? `w-64` : 'w-0'} hidden lg:block`}/>*/}

        </>
    )
}

function RenderPage ({selectedPage, setSelectedPage}) {
  console.log('selected page in RenderPage', selectedPage)
  return selectedPage ? (
      <div className={theme.page.pageContainer}>
        <div className={'w-full flex justify-between items-center'}>
            {selectedPage} <button className={'p-0.5 text-gray-900'} onClick={() => setSelectedPage('')} >x</button></div>
      </div>
  ) : <div className={theme.page.pageContainer}>no page selected</div>
}
function PagesManager({item, dataItems, ...rest}) {
    const {baseUrl, theme, user} = React.useContext(CMSContext) || {}
    const [selectedPage, setSelectedPage] = useState();
    console.log('props', item, rest)
    return (
        <div className={`${theme?.page?.wrapper2}`}>
          <div className={theme?.page?.wrapper3}>
            {/* Content */}
            <div className='flex items-center'>
              <div className='text-2xl p-3 font-thin flex-1'>Pages</div>
            </div>
            <div className={'flex w-full h-full max-h-100vh overflow-hidden'}>
              <Nav item={item} dataItems={dataItems} selectedPage={selectedPage} setSelectedPage={setSelectedPage} edit={true}/>
              <RenderPage selectedPage={selectedPage} setSelectedPage={setSelectedPage}/>
            </div>
          </div>
        </div>
    )
}

export default PagesManager

