import React, {useState, useContext} from 'react'
import {NavLink, useLocation, matchRoutes} from "react-router";
import Nestable from './nestableInHouse';
import {ThemeContext} from "../useTheme";
import Icon from "./Icon"
import Button from "./Button"

export const nestableTheme = {
    container: `max-w-full max-h-full  pb-6 `,
    navListContainer: 'h-full border-l  pt-3 pl-2 overflow-auto max-h-[calc(100vh_-_155px)] min-h-[calc(100vh_-_155px)]',
    navItemContainer: 'text-slate-600 border-l border-y rounded border-transparent flex items-center gap-1 cursor-pointer group group-hover:bg-blue-100',
    navItemContainerActive: 'bg-white text-blue-500  border-l rounded border-y border-slate-300 flex items-center gap-1 cursor-pointer group group-hover:bg-blue-100',
    navLink: `flex-1 px-4 py-2 font-light text-elipses`,
    subList: 'pl-[30px]',
    collapseIcon: 'text-gray-400 hover:text-gray-500',
    dragBefore: 'before:absolute before:top-0 before:left-0 before:right-0 before:bottom-0 before:bg-blue-300 before:border-dashed before:rounded before:border before:border-blue-600',

}

const getParentSlug = (item, dataItems) => {
    if (!item.parent) {
        return ''
    }
    let parent = dataItems.filter(d => d.id === item.parent)[0]
    return `${parent.url_slug}/`
}

export const toSnakeCase = str =>
    str &&
    str
        .match(/[A-Z]{2,}(?=[A-Z][a-z]+[0-9]*|\b)|[A-Z]?[a-z]+[0-9]*|[A-Z]|[0-9]+/g)
        .map(x => x.toLowerCase())
        .join('_');

const getUrlSlug = (item, dataItems) => {
    let slug = `${getParentSlug(item, dataItems)}${toSnakeCase(item.title)}`

    if ((item.url_slug && item.url_slug === slug) || !dataItems.map(d => d.url_slug).includes(slug)) {
        return slug
    }
    return `${slug}_${item.index}`
}

function DefaultNavItem({
                            item,
                            handleCollapseIconClick,
                            isExpanded,
                            edit,
                            baseUrl,
                            OpenIcon: openIconFromProps = 'ArrowDown',
                            ClosedIcon: closedIconFromProps = 'ArrowRight'
                        }) {
    const {theme: themeFromContext = {nestable: nestableTheme}} = React.useContext(ThemeContext);
    const theme = {...themeFromContext, nestable: {...nestableTheme, ...(themeFromContext.nestable || {})}};
    const {pathname = '/edit'} = useLocation()

    //-- this is not ideal, better to check id and parent
    const isActive = matchRoutes([{path: item.url_slug}], pathname.replace('/edit', ''))?.length > 0

    const OpenIcon = () => <Icon icon={openIconFromProps}/>;
    const ClosedIcon = () => <Icon icon={closedIconFromProps}/>;

    return (
        <div key={item.id} className='group'>
            <div
                className={`${isActive ? theme?.nestable?.navItemContainerActive : theme?.nestable?.navItemContainer}`}>
                <NavLink className={theme?.nestable?.navLink}
                         to={`${edit ? `${baseUrl}/edit` : baseUrl}/${item.url_slug || item.id}`}>{item.title}</NavLink>
                {
                    !item.children?.length ?
                        null :
                        isExpanded ?
                            <OpenIcon className={theme?.nestable?.collapsIcon}
                                      onClick={() => handleCollapseIconClick()}/> :
                            <ClosedIcon className={theme?.nestable?.collapsIcon}
                                        onClick={() => handleCollapseIconClick()}/>
                }
            </div>
        </div>
    )

}

export const docs = {
    themeKey: 'nestable',
    dataItems: [
        // Parent 1
        {
            id: 1,
            index: 0,
            title: 'Parent One',
            url_slug: '/parent-one',
        },
        // Children of Parent 1
        {
            id: 2,
            index: 1,
            title: 'Child One A',
            url_slug: '/parent-one/child-a',
            parent: 1
        },
        {
            id: 3,
            index: 2,
            title: 'Child One B',
            url_slug: '/parent-one/child-b',
            parent: 1
        },

        // Parent 2
        {
            id: 4,
            index: 3,
            title: 'Parent Two',
            url_slug: '/parent-two',
        },
        // Child of Parent 2
        {
            id: 5,
            index: 4,
            title: 'Child Two A',
            url_slug: '/parent-two/child-a',
            parent: 4
        },

        // Parent 3
        {
            id: 6,
            index: 5,
            title: 'Parent Three',
            url_slug: '/parent-three',
        },
        // Children of Parent 3
        {
            id: 7,
            index: 6,
            title: 'Child Three A',
            url_slug: '/parent-three/child-a',
            parent: 6
        },
        {
            id: 8,
            index: 7,
            title: 'Child Three B',
            url_slug: '/parent-three/child-b',
            parent: 6
        }
    ]

}

function DraggableNav({
                          item,
                          dataItems: dataItemsProp,
                          NavComp = DefaultNavItem,
                          baseUrl,
                          apiUpdate,
                          edit = true,
                          renderAddItemButton = true
                      }) {
    const {theme: themeFromContext = {}} = useContext(ThemeContext);
    const theme = {...themeFromContext, nestable: {...nestableTheme, ...(themeFromContext.nestable || {})}}
    const {pathname = '/edit'} = useLocation()

    const [localData, setLocalData] = React.useState(dataItemsProp);

    React.useEffect(() => {
        setLocalData(dataItemsProp);
    }, [dataItemsProp]);


    const onDragEnd = React.useCallback(async (tree, updatedDataItemsFlat) => {
        // updatedDataItemsFlat is the flat hash object we passed from Nestable
        // Immediately update local copy used to render
        setLocalData(Object.values(updatedDataItemsFlat));

        // Here `updateNav` expects the nested "tree" and current hash to diff against
        // Use the *previous* dataItemsProp or updatedDataItemsFlat depending on your intended diff.
        const dataItemsHash = (dataItemsProp || []).reduce((out, curr) => {
            out[curr.id] = curr;
            return out;
        }, {});

        const updates = updateNav(tree, '', dataItemsHash);

        // compute newItems to produce slugs (same logic you had)
        const newItems = [
            ...updates,
            ...dataItemsProp.filter(d => !updates.map(i => i.id).includes(d.id))
        ];
        updates.forEach((item) => {
            item.url_slug = getUrlSlug(item, newItems);
        });

        try {
            await Promise.all(updates.map(item => apiUpdate({ data: item })));
        } catch (err) {
            console.error('Persisting nav updates failed', err);
        }

        return updates;
    }, [apiUpdate, dataItemsProp]);

    const findParents = (localData, id) => {
        let parent = localData.filter(d => +d.id === +id)?.[0]?.parent
        if (!parent) {
            return [id]
        }
        return [id, ...findParents(localData, parent)].filter(d => d)
    }

    let matchItems = localData.map(d => ({...d, path: `${d.url_slug}/*`}))

    let matchId = matchRoutes(matchItems, {pathname: pathname.replace(baseUrl, '').replace('edit/', '')})?.[0]?.route?.id || -1
    let matches = findParents(localData, matchId)

    // use localData to compute items and dataItemsObj for Nestable
    const items = (localData || dataItemsProp)
        .sort((a, b) => a.index - b.index)
        .filter(d => !d.parent)
        .map((d) => ({
            id: d.id,
            index: d.index,
            title: d.title,
            url_slug: d.url_slug,
            parent: d.parent,
            isExpanded: d.isExpanded || matches.includes(d.id) || false,
            children: getChildNav(d, (localData || dataItemsProp), baseUrl, edit, matches)
        }));

    const dataItemsObj = (localData || dataItemsProp).reduce((out, curr) => {
        out[curr.id] = { ...curr, children: getChildNav(curr, (localData || dataItemsProp), baseUrl, edit, matches) };
        return out;
    }, {});

    return (
        <div className={theme?.nestable?.container}>
            <div className={theme?.nestable?.navListContainer}>
                <Nestable
                    items={items}
                    dataItems={dataItemsObj}
                    matches={matches}
                    onChange={onDragEnd}
                    maxDepth={4}
                    renderItem={(props) => (
                        <NavComp
                            activeItem={item}
                            edit={edit}
                            item={props.item}
                            dataItems={localData || dataItemsProp}
                            handleCollapseIconClick={props.handleCollapseIconClick}
                            isExpanded={props.isExpanded}
                        />
                    )}
                />
            </div>
            {edit && renderAddItemButton && <AddItemButton dataItems={localData || dataItemsProp} apiUpdate={apiUpdate}/>}
        </div>
    );
}


function AddItemButton({dataItems, apiUpdate, user = {}}) {
    //const submit = useSubmit();
    const {pathname = '/edit'} = useLocation();
    const [loading, setLoading] = useState(false);

    const highestIndex = dataItems
        .filter(d => !d.parent)
        .reduce((out, d) => {
            return Math.max(isNaN(d.index) ? -1 : d.index, out)
        }, -1)

    const item = {
        title: `Page ${highestIndex + 1}`,
        index: highestIndex + 1,
        published: 'draft',
        history: [{
            type: ' created Page.',
            user: user.email,
            time: new Date().toString()
        }]
    }
    item.url_slug = getUrlSlug(item, dataItems)

    const addItem = async () => {
        setLoading(true);
        await apiUpdate({data: item})
        setLoading(false);
    }
    return (
        <div className='border px-4 py-2 rounded '>
            <Button
                onClick={addItem}
                className={'w-full'}
            >
                {loading ? 'Adding Page' : '+ Add Page'}
            </Button>
        </div>
    )
}

function updateNav(items, parentId = '', dataItemsHash) {
    // recursive depth nav updater
    let updates = []
    items.forEach((newItem, i) => {
        let orig = dataItemsHash[+newItem.id]
        if(!orig) return [];
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


function getChildNav(item, dataItems, baseUrl, edit = true, matches=[]) {
    let children = dataItems
        .filter(d => d.parent === item.id)
        .sort((a, b) => a.index - b.index)

    return children.map((d, i) => {
        return {
            id: d.id,
            index: d.index,
            title: d.title,
            url_slug: d.url_slug,
            isExpanded: matches.includes(d.id) || d.isExpanded,
            parent: d.parent,
            children: getChildNav(d, dataItems, baseUrl, edit, matches)
        }
    })

}

export default DraggableNav