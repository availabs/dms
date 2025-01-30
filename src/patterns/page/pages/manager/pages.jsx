import React, {Fragment, useEffect, useRef, useState} from 'react'
import {NavLink, useSubmit, useLocation, useNavigate} from "react-router-dom";
import Nestable from '../../ui/components/nestable';
import {ArrowDown, ArrowUp, ArrowRight, ArrowLeft, DraftPage} from '../../ui/icons';
import {json2DmsForm, getUrlSlug} from '../_utils'
import {CMSContext} from '../../siteConfig'
import PageEdit from "../edit";

const customTheme = {
    nav: {
        container: (open) => open ? `w-1/4 max-w-[25%] border-r overflow-hidden` : `hidden`,
        navItemContainer: 'max-h-[80vh] w-full overflow-y-auto overflow-x-hidden pt-3 scrollbar-xs',
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
        expandCollapseButton: 'p-0.5 h-fit w-fit rounded-md text-blue-400 text-xs  hover:text-blue-500'
    },
  page: {
        pageContainer: (small) => `border max-h-[80vh] ${small ? `max-w-[90%] w-[90%]` : `max-w-[100%]`} overflow-y-auto overflow-x-auto scrollbar-xs`,
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
                className={customTheme.nav.addItemButton}
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

const Pill = ({color, text}) => {
    const colors = {
        orange: `bg-orange-500/15 text-orange-700 group-data-[hover]:bg-orange-500/25`,
        blue: `bg-blue-500/15 text-blue-700 group-data-[hover]:bg-blue-500/25`,
        gray: `text-gray-400`
    };
    return (
        <div
            className="group relative inline-flex rounded-md focus:outline-none">
            <span className={`inline-flex items-center gap-x-1.5 rounded-md px-1.5 py-0.5 text-sm/5 font-medium sm:text-xs/5 forced-colors:outline
            ${colors[color]}
            `}>{text}</span>
        </div>
    )
}

function Nav({dataItems, edit, open, setOpen, selectedPage, setSelectedPage}) {
    const submit = useSubmit()
    const {pathname = '/edit'} = useLocation()
    const navigate = useNavigate();
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
            }))
    }, []);

    const detectHasChanges = item => item.published === 'draft' || item.has_changes === 'true' || item.has_changes === true;

    const mapDataItemToItem = (d, i) => {
        let item = {
            id: d.id,
            index: d.index,
            title: d.title,
            has_changes: detectHasChanges(d),
            url: d.url_slug
        }
        if (getChildNav(item, dataItems)) {
            item.children = getChildNav(d, dataItems)
        }

        item.Comp = ({isExpanded, hasChanges, isSelectedPage}) => {
            const unpublishedChildren = getUnpublishedChildrenCount(item, dataItems);
            const allChildren = getAllChildrenCount(item, dataItems);

            return (
                <div key={item.id}
                     className={`p-1.5 flex items-center gap-1 cursor-pointer ${isSelectedPage ? `bg-gray-100` : ``} hover:bg-gray-100 rounded-md`}>

                    <span className={'flex-1 truncate'}
                          title={item.title}
                          onClick={e => {
                              e.stopPropagation();
                              setSelectedPage(item.id);
                          }}>{item.title}
                    </span>

                        <div className={'flex gap-0.5 items-center'}>
                            {/*unpublished pill*/}
                            {hasChanges ?  <DraftPage className={'text-orange-500'} />  : null}
                            {/*unpublished children pill*/}
                            {unpublishedChildren ? <Pill text={unpublishedChildren} color={'orange'} /> : null}
                            {/*total children pill*/}
                            {allChildren ? <Pill text={allChildren} color={'gray'} /> : null}
                        </div>


                    {!item.children?.length ? '' : isExpanded ?
                        <ArrowUp className={'text-gray-400 hover:text-gray-500'}  onClick={() => {
                            toggleExpand(item.id)
                        }}/> :
                        <ArrowDown className={'text-gray-400 hover:text-gray-500'} onClick={() => {
                            toggleExpand(item.id)
                        }}/>
                    }

                    {/*<NavLink to={item.url}>*/}
                    {/*    <LinkSquare height={15} width={15} className={'text-gray-600 hover:text-blue-600'}/>*/}
                    {/*</NavLink>*/}
                </div>
            )
        };
        return item
    }

    function getUnpublishedChildrenCount (item, dataItems) {
        let children = dataItems.filter(d => d.parent === item.id)

        if (children.length === 0) return 0 // detectHasChanges(item) ? 1 : 0;

        return children.reduce((acc, c) => acc +
                (detectHasChanges(c) ? 1 : 0) + // count current item
                getUnpublishedChildrenCount(c, dataItems) // count current item's unpublished children
            , 0)
    }

    function getAllChildrenCount (item, dataItems) {
        let children = dataItems.filter(d => d.parent === item.id)

        if (children.length === 0) return 0 // detectHasChanges(item) ? 1 : 0;

        return children.reduce((acc, c) => acc +
                1 + // count current item
                getAllChildrenCount(c, dataItems) // count current item's unpublished children
            , 0)
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
        const hasChanges = detectHasChanges(item);
        const isSelectedPage = selectedPage === item.id;
        return (
            <>
                <Comp isExpanded={isExpanded} hasChanges={hasChanges} isSelectedPage={isSelectedPage}/>
                {isExpanded ? <div className={'pl-3 ml-2 border-l'}>{item.children.map(renderItem)}</div> : null}
            </>
        )
    }

    if(!open) {
        return <ArrowRight className={'cursor-pointer text-blue-400 hover:text-blue-500'} onClick={() => setOpen(true)} />
    }
    return (
        <div className={customTheme.nav.container(open)}>
            <div className={customTheme.nav.navItemContainer}>
                <div className={'px-1 flex gap-1 w-full justify-end'}>
                    <button className={customTheme.nav.expandCollapseButton} onClick={() => setExpandedItems({})}>
                        Collapse All
                    </button>
                    <button className={customTheme.nav.expandCollapseButton}
                            onClick={() => setExpandedItems(getExpandableItems(items).reduce((acc, curr) => ({
                                ...acc,
                                [curr]: true
                            }), {}))}
                    >Expand All
                    </button>
                    <ArrowLeft className={'cursor-pointer text-blue-400 hover:text-blue-500'} onClick={() => setOpen(false)} />
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
    )
}

function RenderPage ({selectedPage, isNavOpen, format, attributes, dataItems, apiLoad, apiUpdate, theme}) {
    const [page, setPage] = useState();

    useEffect(() => {
        if(!selectedPage) return;

        async function load(){
            const config = {
                format,
                children: [
                    {
                        type: () => {},
                        action: 'view',
                        filter: {
                            stopFullDataLoad: true,
                            options: JSON.stringify({
                                filter: {id: [selectedPage]},
                            }),
                        },
                        path: `view/:id`,
                        params: {id: selectedPage}
                    }
                ]
            }
            const res = await apiLoad(config, `/view/${selectedPage}`);
            setPage(res[0]);
        }

        load();
    }, [selectedPage]);

    return <div className={customTheme.page.pageContainer(isNavOpen)}>
        {
            selectedPage && page ?
                <PageEdit item={page} dataItems={dataItems} attributes={attributes}
                          apiLoad={apiLoad} apiUpdate={apiUpdate}
                          format={format} siteType={'prod'}
                          updateAttribute={e => console.log('updateAttribute called', e)}
                          theme={{
                              layout: {wrapper: 'max-w-full'},
                              page: {'wrapper1': 'max-w-full'}
                          }}
                /> : <div className={'text-center mt-16'}>Please click on a page title to preview it.</div>
        }
    </div>
}

function PagesManager({item, dataItems, format, attributes, apiLoad, apiUpdate, ...rest}) {
    const {baseUrl, theme, user} = React.useContext(CMSContext) || {};
    const [open, setOpen] = useState(true);
    const [selectedPage, setSelectedPage] = useState();

    return (
        <div className={`${theme?.page?.wrapper2}`}>
          <div className={`${theme?.page?.wrapper3} max-w-[100vw]`}>
            {/* Content */}
            <div className='flex items-center'>
              <div className='text-2xl p-3 font-thin flex-1'>Pages</div>
            </div>
            <div className={'flex w-full max-w-[85%] h-full overflow-hidden'}>
              <Nav item={item} dataItems={dataItems} open={open} setOpen={setOpen} selectedPage={selectedPage} setSelectedPage={setSelectedPage} edit={true}/>
              <RenderPage selectedPage={selectedPage} setSelectedPage={setSelectedPage}
                          format={format} attributes={attributes}
                          apiLoad={apiLoad} apiUpdate={apiUpdate} dataItems={dataItems}
                          isNavOpen={open} theme={theme}
              />
            </div>
          </div>
        </div>
    )
}

export default PagesManager

