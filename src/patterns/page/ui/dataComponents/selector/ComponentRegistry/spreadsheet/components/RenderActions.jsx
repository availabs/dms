import React from "react";
import {Link} from "react-router-dom";
import {convertToUrlParams} from "../../../dataWrapper/utils/utils";
import {actionsColSize} from "../constants"
import Icons from "../../../../../../../forms/ui/icons";
import {uniq} from "lodash-es";

const getIcon = ({icon, name}) => (icon) ? Icons[icon] : () => name;

export const RenderAction = ({ newItem={}, removeItem=() => {}, columns=[], action={}}) => {
    const groupBy = columns
        .filter(({name, group}) => group && newItem[name])
        .map(({name}) => ({column: name, values: [newItem[name]]}));

    const filters = columns
        .filter(({internalFilter, externalFilter}) => Array.isArray(internalFilter) || Array.isArray(externalFilter))
        .map(({name, internalFilter=[], externalFilter=[]}) => ({column: name, values: uniq([...internalFilter, ...externalFilter])}));

    const searchParams = groupBy.length ? convertToUrlParams([...groupBy, ...filters], '|||') : `id=${newItem.id}`;

    const Icon = getIcon({name: action.name, icon: action.icon || (action.type === 'delete' && 'TrashCan')})
    return (
        action.actionType === 'url' ? (
            <Link key={`${action.name}`}
                  title={action.name}
                  className={'flex items-center w-fit p-0.5 mx-0.5 bg-blue-300 hover:bg-blue-500 text-white rounded-lg'}
                  to={`${action.url}?${searchParams}`}>
                <Icon className={'text-white'}/>
            </Link>
        ) : groupBy.length ? null : (
            <button
                key={`delete`}
                title={'delete'}
                className={'w-fit p-0.5 mx-0.5 bg-red-300 hover:bg-red-500 text-white rounded-lg'}
                onClick={e => {removeItem(newItem)}}>
                <Icon className={'text-white'}/>
            </button>
        )
    )
}