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
                    children: d.children?.length ? buildTree(dataItems, matches, d.children.map(c => c.id)) : []
                }
            })
    }catch (e){
        console.error('Error building tree', e);
        return []
    }
}
const RenderNestable = ({ parent, items, onChange, dataItems, setDataItems, renderItem, dragState, setDragState, expanded, setExpanded, canDrag, canAcceptChildren }) => {
    // =================================================================================================================
    // ========================================= drag - drop utils begin ===============================================
    // =================================================================================================================
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
            // console.log(`move ${dragState.dragItem} to ${idx}`)
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

            setDataItems(updatedDateItems);
            onChange?.(buildTree(updatedDateItems, expanded, []), updatedDateItems);

        }else if (moveType === 'INSERT_AS_CHILD'){
            // update parent and idx
            // console.log(`move as a child to parent at idx ${dragState.dragOverIdx}`)
            const updatedDateItems = cloneDeep(dataItems);
            const item = dataItems[dragState.dragItem];
            const oldParentId = item.parent;
            const newParent = dataItems[parent || dragState.dragOverParent] || {}; // if dropped on an unexpanded item, parent is passed. this changed so item has to be expanded
            // console.log(`move item ${item.title}: ${dataItems[oldParentId]?.title} => ${newParent?.title} `)
            let childrenToUpdate =
                Object.values(dataItems)
                    .filter(i => !newParent.id ? !i.parent : i.parent === newParent.id)
                    .sort((a,b) => +a.index - +b.index)

            if(idx > childrenToUpdate.length - 1 || idx === undefined){
                childrenToUpdate.push({...item, parent: newParent.id});
            }else{
                childrenToUpdate.splice(+idx, 0, {...item, parent: newParent.id})
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
            const newTree = buildTree(updatedDateItems, expanded, []);
            onChange?.(newTree, updatedDateItems);
        }

        setDragState(draft => {
            draft.isDragging = false;
            draft.dragOverParent = null;
            draft.dragOverIdx = null;
            draft.dragOverItem = null;
            draft.dragItem = null
        })
    };

    const dragStart = (e, item) => {
        setDragState(draft => {
            draft.isDragging = true;
            draft.dragItem = item.id;
        });
    };

    // unified dragover logic — sets the tentative drop slot while moving
    const handleDragOver = (e, item, idx) => {
        if (!dragState.dragItem) return;

        e.preventDefault();
        const rect = e.currentTarget.getBoundingClientRect();
        const offset = e.clientY - rect.top;
        const isBefore = offset < rect.height / 4;
        const dropIdx = isBefore ? idx : idx + 1;

        setDragState(draft => {
            draft.dragOverParent = item.parent;
            draft.dragOverIdx = dropIdx;
            draft.dragOverItem = item.id;
        });
    };

    // compute and perform drop directly from the mouse position at drop time
    const handleDropOnItemWrapper = (e, item, idx) => {
        if (!dragState.dragItem) return;
        e.preventDefault();
        e.stopPropagation();

        const draggedItem = dataItems[dragState.dragItem];

        // Check if this item can accept children
        if (canAcceptChildren && !canAcceptChildren(dataItems[item.id])) {
            // Item cannot accept children, treat as reorder within same parent instead
            const dropParent = item.parent;
            const isMovingBetweenParents = draggedItem?.parent !== dropParent;
            const moveType = isMovingBetweenParents ? 'INSERT_AS_CHILD' : 'MOVE';

            const rect = e.currentTarget.getBoundingClientRect();
            const offset = e.clientY - rect.top;
            const isBefore = offset < rect.height / 2;
            const dropIdx = isBefore ? idx : idx + 1;

            onDrop({ e, moveType, idx: dropIdx, parent: dropParent });
            return;
        }

        // If dropping onto a parent that the item is already a child of, do nothing
        // (prevents issues when dropping onto section headers)
        if (draggedItem?.parent === item.id) {
            setDragState(draft => {
                draft.isDragging = false;
                draft.dragOverParent = null;
                draft.dragOverIdx = null;
                draft.dragOverItem = null;
                draft.dragItem = null;
            });
            return;
        }

        const rect = e.currentTarget.getBoundingClientRect();
        const offset = e.clientY - rect.top;
        const isBefore = offset < rect.height / 2;
        const dropIdx = isBefore ? idx : idx + 1;
        const dropParent = item.parent;

        const isMovingBetweenParents = draggedItem?.parent !== dropParent;
        const moveType = 'INSERT_AS_CHILD';
        // const moveType = isMovingBetweenParents ? 'INSERT_AS_CHILD' : 'MOVE';

        onDrop({ e, moveType, idx: undefined, parent: item.id });
    };

    // drop into the empty space after the list (last position)
    const handleDropOnTrailing = (e) => {
        if (!dragState.dragItem) return;
        e.preventDefault();
        e.stopPropagation();

        const dropParent = parent || null;
        const dropIdx = items.length; // append to end

        const isMovingBetweenParents = dataItems[dragState.dragItem]?.parent !== dropParent;
        const moveType = isMovingBetweenParents ? 'INSERT_AS_CHILD' : 'MOVE';

        onDrop({ e, moveType, idx: dropIdx, parent: dropParent });
    };

    const RenderPlaceHolder = ({ idx, slotParent }) => {
        if(!dragState.isDragging) return null;

        if(
            dragState.dragOverParent === slotParent &&
            dragState.dragOverIdx === idx
        ){
            return (
                <div
                    className="p-2"
                    onDragOver={e => {
                        e.preventDefault();   // REQUIRED
                        setDragState(draft => {
                            draft.dragOverItem = null;
                        })
                    }}
                    onDrop={e => {
                        const isMovingBetweenParents =
                            dataItems[dragState.dragItem]?.parent !== slotParent;

                        const moveType = isMovingBetweenParents ? 'INSERT_AS_CHILD' : 'MOVE';
                        onDrop({ e, moveType, idx, parent: slotParent });
                    }}
                >
                    <div className={`w-full ${dragState.dragOverItem ? `h-[10px]` : `h-[40px] bg-blue-300 border border-dashed`} rounded-md`} />
                </div>
            );
        }
        return null;
    };

    // =================================================================================================================
    // ========================================= drag - drop utils end =================================================
    // =================================================================================================================

    return (
        <div>
            {items.map((item, idx) => (
                <div key={item.id}>

                    {/* single 'before item' placeholder per item */}
                    <RenderPlaceHolder idx={idx} slotParent={item.parent} />

                    {/* wrapper that detects top/bottom half and accepts drop */}
                    <div
                        className={dragState.dragOverItem === item.id && (!canAcceptChildren || canAcceptChildren(dataItems[item.id])) ? 'bg-blue-300 border border-dashed rounded-md' : ``}
                        draggable={!canDrag || canDrag(dataItems[item.id])}
                        onDragStart={e => {
                            if (canDrag && !canDrag(dataItems[item.id])) {
                                e.preventDefault();
                                return;
                            }
                            dragStart(e, item);
                        }}
                        onDragOver={e => handleDragOver(e, item, idx)}
                        onDrop={e => handleDropOnItemWrapper(e, item, idx)}
                    >
                        {renderItem({
                            item,
                            isExpanded: expanded.includes(item.id),
                            handleCollapseIconClick: () => {
                                setExpanded(draft => {
                                    const index = draft.indexOf(item.id);

                                    if (index !== -1) {
                                        draft.splice(index, 1);
                                    } else {
                                        draft.push(item.id);
                                    }
                                })
                            }
                        })}
                    </div>

                    {/* children recursion */}
                    {(expanded.includes(item.id) || expanded.includes(item.id)) &&
                        dataItems[item.id].children?.length > 0 && (
                            <div className="ml-4 border-l">
                                <RenderNestable
                                    parent={item.id}
                                    items={buildTree(dataItems, expanded,
                                        Object.values(dataItems)
                                            .filter(x => x.parent === item.id)
                                            .sort((a,b) => +a.index - +b.index)
                                            .map(c => c.id))}
                                    dataItems={dataItems}
                                    setDataItems={setDataItems}
                                    renderItem={renderItem}
                                    onChange={onChange}
                                    dragState={dragState}
                                    setDragState={setDragState}
                                    expanded={expanded}
                                    setExpanded={setExpanded}
                                    canDrag={canDrag}
                                    canAcceptChildren={canAcceptChildren}
                                />
                            </div>
                        )}
                </div>
            ))}

            {/* trailing placeholder / drop zone at the end of the list */}
            <RenderPlaceHolder idx={items.length} slotParent={parent || null} />

            {/* trailing drop wrapper so user can drop after the last item */}
            <div
                style={{ minHeight: 8 }}
                onDragOver={e => {
                    if (!dragState.dragItem) return;
                    e.preventDefault();   // REQUIRED

                    setDragState(draft => {
                        draft.dragOverParent = parent || null;
                        draft.dragOverIdx = items.length;
                    });
                }}
                onDrop={e => {
                    e.preventDefault();

                    const dropParent = parent || null;
                    const dropIdx = items.length;

                    const isMovingBetweenParents =
                        dataItems[dragState.dragItem]?.parent !== dropParent;

                    const moveType = isMovingBetweenParents ? 'INSERT_AS_CHILD' : 'MOVE';

                    onDrop({ e, moveType, idx: dropIdx, parent: dropParent });
                }}
            />

        </div>
    );
};

export default function NestableInHouse({ dataItems: dataItemsInit, matches, canDrag, canAcceptChildren, ...props }) {
    const [dataItems, setDataItems] = useImmer(dataItemsInit);
    const [expanded, setExpanded] = useImmer(matches);
    const [dragState, setDragState] = useImmer({
        isDragging: false,
        dragOverParent: null,
        dragOverIdx: null,
        dragOverItem: null, // used to highlight INSERT_AS_CHILD
        dragItem: null
    })

    useEffect(() => {
        if(!isEqual(dataItemsInit, dataItems)) {
            setDataItems(dataItemsInit)
        }
    }, [dataItemsInit]);

    const itemsTree = useMemo(() => buildTree(dataItems, matches, []), [dataItems]);

    return <RenderNestable
        items={itemsTree}
        dataItems={dataItems}
        setDataItems={setDataItems}
        dragState={dragState}
        setDragState={setDragState}
        expanded={expanded}
        setExpanded={setExpanded}
        canDrag={canDrag}
        canAcceptChildren={canAcceptChildren}
        {...props} />;
}