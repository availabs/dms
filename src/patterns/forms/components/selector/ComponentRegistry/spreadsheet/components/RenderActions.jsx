import React from "react";
import {Link} from "react-router-dom";
import {convertToUrlParams} from "../utils/utils";
import {actionsColSize} from "../constants"
import Icons from "../../../../../ui/icons";

const getIcon = ({icon, name}) => (icon) ? Icons[icon] : () => name;

export const RenderActions = ({isLastCell, newItem, removeItem, groupBy=[], filters=[], actions=[]}) => {
    if(!isLastCell || !actions.length) return null;
    const searchParams = groupBy.length ?
        convertToUrlParams(
            [...groupBy.filter(col => newItem[col]).map(column => ({column, values: [newItem[column]]})),
                ...filters]
        ) : `id=${newItem.id}`
    // console.log('SP?', searchParams, groupBy)
    return (
        <div className={'flex items-center border'}>
            <div className={'flex flex-row h-fit justify-evenly'} style={{width: actionsColSize}}>
                {
                    actions.map(action => {
                        const Icon = getIcon({name: action.name, icon: action.icon || (action.type === 'delete' && 'TrashCan')})
                        return action.type === 'url' ? (
                            <Link
                                key={`${action.name}`}
                                title={action.name}
                                className={'flex items-center w-fit p-0.5 mx-0.5 bg-blue-300 hover:bg-blue-500 text-white rounded-lg'}
                                to={`${action.url}?${searchParams}`}>
                                <Icon className={'text-white'}/>
                            </Link>
                        ) : groupBy.length ? null :(
                            <button
                                key={`delete`}
                                title={'delete'}
                                className={'w-fit p-0.5 mx-0.5 bg-red-300 hover:bg-red-500 text-white rounded-lg'}
                                onClick={e => {removeItem(newItem)}}>
                                <Icon className={'text-white'}/>
                            </button>
                        )
                    })
                }
            </div>
        </div>
    )
}