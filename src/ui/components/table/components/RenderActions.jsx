import React from "react";
import {Link} from "react-router";
import {uniq} from "lodash-es";
import {convertToUrlParams} from "../../../../patterns/page/pages/_utils";


const getIcon = ({icon, name}) => {
    return () => <span>{name}</span> //(icon) { return () => ; } /*? Icons[icon] :*/ 
}

export const RenderAction = ({ newItem={}, removeItem=() => {}, columns=[], action={}}) => {
    const groupBy = columns
        .filter(({name, group}) => group && newItem[name])
        .map(({name}) => ({column: name, values: [newItem[name]]}));

    const filters = columns
        .filter(({internalFilter, externalFilter}) => Array.isArray(internalFilter) || Array.isArray(externalFilter))
        .map(({name, internalFilter=[], externalFilter=[]}) => ({column: name, values: uniq([...internalFilter, ...externalFilter])}));

    const searchParams = groupBy.length ? convertToUrlParams([...groupBy, ...filters].reduce((acc, curr) => ({...acc, [curr.column]: typeof curr.values === 'string' ? [curr.values] : curr.values}), {}), '|||') : `id=${newItem.id}`;

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