import React, {useState, useContext} from "react";
import {Link} from "react-router";
import {uniq} from "lodash-es";
import {convertToUrlParams} from "../../../../patterns/page/pages/_utils";
import {DeleteModal} from "../../DeleteModal";
import Icon from "../../Icon"
import Button from "../../Button"
import Popup from "../../Popup"
import {TableCellContext} from "../index";


const getIcon = ({icon, name}) => {
    return () => <span>{name}</span> //(icon) { return () => ; } /*? Icons[icon] :*/ 
}

const DeleteBtn = ({removeItem, newItem}) => {
    const { theme = {} } = useContext(TableCellContext) || {};
    const [showDeleteModal, setShowDeleteModal] = useState(false);

    function deleteItem() {
        removeItem(newItem);
        setShowDeleteModal(false)
    }

    return (
        <>
            <Button
                key={`delete`}
                title={'delete'}
                activeStyle={theme.actionDeleteBtnStyle}
                onClick={() => setShowDeleteModal(true)}>
                <Icon className={theme.actionBtnIcon} icon={'TrashCan'}/>
            </Button>

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
    const { theme = {} } = useContext(TableCellContext) || {};
    // Key off the row's display alias (normalName) when present, falling back to `name`.
    // Joined/aggregated group columns store their value under normalName (e.g. `meta.county as county`
    // → row key `county`), so reading `newItem[name]` alone would miss them and drop the param.
    // BC: simple columns have normalName === name (or undefined), so this is identical for them.
    const groupBy = columns
        .filter(({name, normalName, group}) => group && newItem[normalName || name])
        .map(({name, normalName}) => ({column: normalName || name, values: [newItem[normalName || name]]}));

    const filters = columns
        .filter(({internalFilter, externalFilter}) => Array.isArray(internalFilter) || Array.isArray(externalFilter))
        .map(({name, internalFilter=[], externalFilter=[]}) => ({column: name, values: uniq([...internalFilter, ...externalFilter])}));

    const searchParams = groupBy.length ? convertToUrlParams([...groupBy, ...filters].reduce((acc, curr) => ({...acc, [curr.column]: typeof curr.values === 'string' ? [curr.values] : curr.values}), {}), '|||') : `id=${newItem.id}`;

    const IconComp = getIcon({name: action.name, icon: action.icon || (action.type === 'delete' && 'TrashCan')})
    return (
        action.actionType === 'url' ? (
            <Link key={`${action.name}`}
                  title={action.name}
                  className={theme.actionLinkBtn}
                  to={`${action.url}?${searchParams}`}>
                <IconComp className={theme.actionBtnIcon}/>
            </Link>
        ) : groupBy.length ? null : (
            <DeleteBtn newItem={newItem} removeItem={removeItem} />
        )
    )
}

const getSearchParams = ({newItem, columns}) => {
    // Key off the row's display alias (normalName) when present, falling back to `name`.
    // Joined/aggregated group columns store their value under normalName (e.g. `meta.county as county`
    // → row key `county`), so reading `newItem[name]` alone would miss them and drop the param.
    // BC: simple columns have normalName === name (or undefined), so this is identical for them.
    const groupBy = columns
        .filter(({name, normalName, group}) => group && newItem[normalName || name])
        .map(({name, normalName}) => ({column: normalName || name, values: [newItem[normalName || name]]}));

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
    const { theme = {} } = useContext(TableCellContext) || {};
    const [showDeleteModal, setShowDeleteModal] = useState(false);

    function deleteItem() {
        removeItem(newItem);
        setShowDeleteModal(false)
    }

    return (
        <>
            <Button
                activeStyle={theme.actionsMenuItemDangerStyle}
                onClick={() => setShowDeleteModal(true)}
            >
                <Icon icon={'TrashCan'} className={'size-3.5'}/>
                <span>Delete</span>
            </Button>
            <DeleteModal
                title={'Delete Row'}
                open={showDeleteModal}
                prompt={'Are you sure you want to delete this row? It will be permanently removed from our servers forever. This action cannot be undone.'}
                setOpen={setShowDeleteModal}
                onDelete={deleteItem}
            />
        </>
    );
};

export const RenderActionsPopup = ({ actionColumns=[], newItem={}, removeItem=() => {}, columns=[] }) => {
    const { theme = {} } = useContext(TableCellContext) || {};
    const {groupBy, searchParams} = getSearchParams({newItem, columns});

    return (
        <Popup
            button={
                <Button activeStyle={theme.actionsMenuTriggerStyle}>
                    <Icon icon={'EllipsisVertical'} className={theme.actionsMenuTriggerIcon} />
                </Button>
            }
            preventCloseOnClickOutside={true}
        >
            <div className={theme.actionsMenu}>
                {actionColumns.map(action =>
                    action.actionType === 'url' ? (
                        <Link key={action.name}
                              to={`${action.url}?${searchParams}`}
                              className={theme.actionsMenuItem}
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