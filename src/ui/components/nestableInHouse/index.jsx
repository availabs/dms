import React, {useRef, useEffect, useState, useMemo} from "react";
import { useImmer } from "use-immer";
import {cloneDeep, isEqual} from "lodash-es";

const buildTree = (dataItems, matches=[], items=[]) => {
    try{
        return Object.values(dataItems)
            .sort((a, b) => a.index - b.index)
            .filter(d => items.length ? items.includes(d.id) : !d.parent)
            .map((d, i) => {
                return {
                    id: d.id,
                    index: d.index,
                    title: d.title,
                    url_slug: d.url_slug,
                    parent: d.parent,
                    isExpanded: typeof d.isExpanded === 'boolean' ? d.isExpanded : matches.includes(d.id),
                    children: d.children?.length ? buildTree(dataItems, matches, d.children.map(c => c.id)) : []
                }
            })
    }catch (e){
        console.error('Error building tree', e);
        return []
    }
}
const RenderNestable = ({ parent, items: itemsProp, matches, onChange, dataItems, setDataItems, renderItem, dragState, setDragState }) => {
    const items = itemsProp;
    // const items = !itemsProp ? Object.values(dataItems).filter(i => i.parent === parent) : itemsProp


    const onDrop = ({e, moveType, idx, parent}) => {
        // moveTypes:
        // inset at index: splice, change index. happens in the same parent.
        // insert as child: using dragOverIdx, change parent and index
        // move from one parent to another

        // details you need to move an item:
        // the item
        // item's new parent
        // item's new index
        // if you only have item's new parent, idx is the last one (INSERT_AS_CHILD)
        // if you only have index, the parent stays the same (MOVE)

        e.preventDefault();
        e.stopPropagation();
        if (!dragState.dragItem) return;

        if(moveType === 'MOVE'){
            console.log(`move ${dragState.dragItem} to ${idx}`)
            const updatedDateItems = cloneDeep(dataItems);
            const item = dataItems[dragState.dragItem];

            let childrenToUpdate =
                Object.values(dataItems)
                    .filter(i => i.parent === item.parent)
                    .sort((a,b) => +a.index - +b.index)

            if(idx < +item.index){
                childrenToUpdate.splice(+item.index, 1);
                childrenToUpdate.splice(idx, 0, {...item, index: idx.toString()});
                childrenToUpdate = childrenToUpdate.map((c, i) => ({...c, index: i.toString()}))
            }else{
                childrenToUpdate.splice(idx, 0, {...item, index: idx.toString()});
                childrenToUpdate.splice(+item.index, 1);
                childrenToUpdate = childrenToUpdate.map((c, i) => ({...c, index: i.toString()}))
            }
            childrenToUpdate.forEach(c => {
                updatedDateItems[c.id] = c
            })
            if(item.parent){
                updatedDateItems[item.parent].children = childrenToUpdate;
            }

            setDataItems(draft => {
                for (const k in updatedDateItems) {
                    draft[k] = updatedDateItems[k];
                }
            });
            onChange?.(buildTree(updatedDateItems, matches, []), updatedDateItems);

        }else if (moveType === 'INSERT_AS_CHILD'){
            // update parent and idx
            console.log(`move as a child to parent at idx ${dragState.dragOverIdx}`)
            const updatedDateItems = cloneDeep(dataItems);
            const item = dataItems[dragState.dragItem];
            const oldParentId = item.parent;
            const newParent = dataItems[parent || dragState.dragOverParent] || {}; // if dropped on an unexpanded item, parent is passed
            console.log(`move item ${item.title}: ${dataItems[oldParentId]?.title} => ${newParent?.title} `)
            let childrenToUpdate =
                Object.values(dataItems)
                    .filter(i => !newParent.id ? !i.parent : i.parent === newParent.id)
                    .sort((a,b) => +a.index - +b.index)

            if(dragState.dragOverIdx > childrenToUpdate.length - 1){
                childrenToUpdate.push({...item, parent: newParent.id});
            }else{
                childrenToUpdate.splice(+dragState.dragOverIdx, 0, {...item, parent: newParent.id})
            }

            childrenToUpdate = childrenToUpdate.map((c, i) => ({...c, index: i.toString()}))

            // update reference
            updatedDateItems[item.id].parent = newParent.id;

            childrenToUpdate.forEach(c => {
                updatedDateItems[c.id] = c
            })

            if(newParent.id){
                // update parent with new children, unless root
                updatedDateItems[newParent.id].children = childrenToUpdate;
            }

            if(oldParentId){
                updatedDateItems[oldParentId].children =
                    updatedDateItems[oldParentId].children
                        .filter(c => c.id !== item.id)
                        .map((c, i) => ({...c, index: i.toString()}));
            }

            setDataItems(draft => {
                for (const k in updatedDateItems) {
                    draft[k] = updatedDateItems[k];
                }
            });
            const newTree = buildTree(updatedDateItems, matches, []);
            onChange?.(newTree, updatedDateItems);
        }

        setDragState(draft => {
            draft.isDragging = false;
            draft.dragOverParent = null;
            draft.dragOverIdx = null;
            draft.dragItem = null
        })
    };

    const dragStart = (e, item) => {
        // e.stopPropagation(); // this makes it only work for siblings

        setDragState(draft => {
            draft.isDragging = true
            draft.dragItem = item.id
        })
    };

    const dragEnter = (e, item, idx) => {
        if(!dragState.dragItem) return;

        setDragState(draft => {
            draft.dragOverParent = item.parent;
            draft.dragOverIdx = idx;
        })
    };

    const RenderPlaceHolder = ({idx, item}) => {
        // idx: index being dragged upon; item: item being dragged upon
        // should be able to drop at the same index or index + 1 (in case of last element in array)
        if(!dragState.isDragging) return null;

        const isMovingBetweenParents = dragState.dragOverParent !== dataItems[dragState.dragItem]?.parent;
        const moveType = isMovingBetweenParents ? 'INSERT_AS_CHILD' : 'MOVE';

        // const isDraggedItemAdjacentBlock = dataItems[dragState.dragItem].parent === item.parent && dragState.dragOverIdx === idx;

        if(!(
            (
                dragState.dragOverIdx === idx || // index matches
                (dragState.dragOverIdx === idx-1 && idx === items.length) // last index + 1 (this is only correct if same parent)
            ) && dragState.dragOverParent === item.parent // the parent you're dragging over matches parent of the item being dragged UPON
            )
        ) return null;

        // console.log('di', dataItems[dragState.dragItem].title, dataItems[dragState.dragItem].parent)
        return (
            <div key={`${item.id}-${idx}-placeholder`}
                 className={'w-full h-[70px] bg-blue-300'}
                 onDragEnter={e => dragEnter(e, item, idx)}
                 onDragOver={e => e.preventDefault()}
                 onDrop={e => onDrop({e, moveType, idx})}
            >
                {/*{JSON.stringify({*/}
                {/*    moveType,*/}
                {/*    dragItemParent: dataItems[dragState.dragItem]?.parent,*/}
                {/*    dragOverParent: dragState.dragOverParent,*/}
                {/*    doi: dragState.dragOverIdx,*/}
                {/*    idxMatch: dragState.dragOverIdx === idx,*/}
                {/*    parentMatch: dragState.dragOverParent === dataItems[dragState.dragItem]?.parent*/}
                {/*}, null, 2)}*/}
            </div>
        )
    }

    return items.map((item, idx) => (
        <div key={item.id}>
            <RenderPlaceHolder idx={idx} item={item} />
            <div
                key={item.id}
                draggable
                onDragStart={e => dragStart(e, item)}
                onDragEnter={e => dragEnter(e, item, idx)}
                onDragOver={e => {
                    e.preventDefault()
                    //todo change color
                }}
                onDrop={e => onDrop({e, moveType: 'INSERT_AS_CHILD', parent: item.id})}
            >
                {renderItem({
                    item,
                    isExpanded: dataItems[item.id].isExpanded,
                    handleCollapseIconClick: () => {
                        setDataItems(draft => {
                            if (!draft[item.id]) return;
                            draft[item.id].isExpanded = !draft[item.id].isExpanded;
                        });
                    }
                })}
            </div>
            {
                (matches.includes(item.id) || dataItems[item.id].isExpanded) && item.children?.length > 0 && (
                    <div className="ml-4 border-l">
                        <RenderNestable
                            parent={item.id}
                            matches={matches}
                            items={buildTree(dataItems, matches, item.children.map(c => c.id))}
                            dataItems={dataItems}
                            setDataItems={setDataItems}
                            renderItem={renderItem}
                            onChange={onChange}
                            dragState={dragState}
                            setDragState={setDragState}
                        />
                    </div>
                )}
            {idx === items.length - 1 ? <RenderPlaceHolder idx={idx + 1} item={item}/> : null}
        </div>
    ));
};

export default function NestableInHouse({ dataItems: dataItemsInit, matches, ...props }) {
    const [dataItems, setDataItems] = useImmer(dataItemsInit);
    const itemsTree = useMemo(() => buildTree(dataItems, matches, []), [dataItems]);
    const [dragState, setDragState] = useImmer({
        isDragging: false,
        dragOverParent: null,
        dragOverIdx: null,
        dragItem: null
    })

    return <RenderNestable
        items={itemsTree}
        dataItems={dataItems}
        setDataItems={setDataItems}
        matches={matches}
        dragState={dragState}
        setDragState={setDragState}
        {...props} />;
}