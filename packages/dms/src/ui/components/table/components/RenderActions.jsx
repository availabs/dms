import React, {useState} from "react";
import {Link} from "react-router";
import {uniq} from "lodash-es";
import {convertToUrlParams} from "../../../../patterns/page/pages/_utils";
import {DeleteModal} from "../../DeleteModal";
import Icon from "../../Icon"
import Popup from "../../Popup"


const getIcon = ({icon, name}) => {
    return () => <span>{name}</span> //(icon) { return () => ; } /*? Icons[icon] :*/ 
}

const DeleteBtn = ({removeItem, newItem}) => {
    const [showDeleteModal, setShowDeleteModal] = useState(false);

    function deleteItem() {
        removeItem(newItem);
        setShowDeleteModal(false)
    }

    return (
        <>
            <button
                key={`delete`}
                title={'delete'}
                className={'w-fit p-0.5 mx-0.5 bg-red-300 hover:bg-red-500 text-white rounded-lg'}
                onClick={() => setShowDeleteModal(true)}>
                <Icon className={'text-white'} icon={'TrashCan'}/>
            </button>

            <DeleteModal
                title={`Delete Row`} open={showDeleteModal}
                prompt={`Are you sure you want to delete this row? It will be permanently removed
                                            from our servers forever. This action cannot be undone.`}
                setOpen={(v) => setShowDeleteModal(v)}
                onDelete={deleteItem}
            />
        </>
    )
}

export const RenderAction = ({ newItem={}, removeItem=() => {}, columns=[], action={}}) => {
    const groupBy = columns
        .filter(({name, group}) => group && newItem[name])
        .map(({name}) => ({column: name, values: [newItem[name]]}));

    const filters = columns
        .filter(({internalFilter, externalFilter}) => Array.isArray(internalFilter) || Array.isArray(externalFilter))
        .map(({name, internalFilter=[], externalFilter=[]}) => ({column: name, values: uniq([...internalFilter, ...externalFilter])}));

    const searchParams = groupBy.length ? convertToUrlParams([...groupBy, ...filters].reduce((acc, curr) => ({...acc, [curr.column]: typeof curr.values === 'string' ? [curr.values] : curr.values}), {}), '|||') : `id=${newItem.id}`;

    const IconComp = getIcon({name: action.name, icon: action.icon || (action.type === 'delete' && 'TrashCan')})
    return (
        action.actionType === 'url' ? (
            <Link key={`${action.name}`}
                  title={action.name}
                  className={'flex items-center w-fit p-0.5 mx-0.5 bg-blue-300 hover:bg-blue-500 text-white rounded-lg'}
                  to={`${action.url}?${searchParams}`}>
                <IconComp className={'text-white'}/>
            </Link>
        ) : groupBy.length ? null : (
            <DeleteBtn newItem={newItem} removeItem={removeItem} />
        )
    )
}

const getSearchParams = ({newItem, columns}) => {
    const groupBy = columns
        .filter(({name, group}) => group && newItem[name])
        .map(({name}) => ({column: name, values: [newItem[name]]}));

    const filters = columns
        .filter(({internalFilter, externalFilter}) => Array.isArray(internalFilter) || Array.isArray(externalFilter))
        .map(({name, internalFilter=[], externalFilter=[]}) => ({column: name, values: uniq([...internalFilter, ...externalFilter])}));

    return {
        groupBy,
        searchParams: groupBy.length
            ? convertToUrlParams([...groupBy, ...filters].reduce((acc, curr) => ({...acc, [curr.column]: typeof curr.values === 'string' ? [curr.values] : curr.values}), {}), '|||')
            : `id=${newItem.id}`
    };
};

const DeleteMenuItem = ({removeItem, newItem}) => {
    const [showDeleteModal, setShowDeleteModal] = useState(false);

    return (
        <>
            <button
                className={'flex items-center gap-2 px-2 py-1.5 text-sm text-red-600 hover:bg-red-50 rounded cursor-pointer whitespace-nowrap w-full text-left'}
                onClick={() => setShowDeleteModal(true)}
            >
                <Icon icon={'TrashCan'} className={'size-3.5'}/>
                <span>Delete</span>
            </button>
            <DeleteModal
                title={'Delete Row'}
                open={showDeleteModal}
                prompt={'Are you sure you want to delete this row? It will be permanently removed from our servers forever. This action cannot be undone.'}
                setOpen={setShowDeleteModal}
                onDelete={() => { removeItem(newItem); setShowDeleteModal(false); }}
            />
        </>
    );
};

export const RenderActionsPopup = ({ actionColumns=[], newItem={}, removeItem=() => {}, columns=[] }) => {
    const {groupBy, searchParams} = getSearchParams({newItem, columns});

    return (
        <Popup
            button={
                <button className={'flex items-center justify-center w-full h-full cursor-pointer'}>
                    <Icon icon={'EllipsisVertical'} className={'text-slate-400 hover:text-blue-500 size-4'} />
                </button>
            }
        >
            <div className={'flex flex-col bg-white shadow-lg rounded-md p-1 min-w-[100px]'}>
                {actionColumns.map(action =>
                    action.actionType === 'url' ? (
                        <Link key={action.name}
                              to={`${action.url}?${searchParams}`}
                              className={'flex items-center gap-2 px-2 py-1.5 text-sm text-slate-700 hover:bg-blue-50 rounded cursor-pointer whitespace-nowrap'}
                        >
                            <Icon icon={action.icon || 'ArrowRight'} className={'size-3.5'}/>
                            <span>{action.name}</span>
                        </Link>
                    ) : groupBy.length ? null : (
                        <DeleteMenuItem key={action.name || 'delete'} removeItem={removeItem} newItem={newItem} />
                    )
                )}
            </div>
        </Popup>
    );
}