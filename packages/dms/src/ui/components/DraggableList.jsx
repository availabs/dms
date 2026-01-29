import React from "react";
import { useImmer } from "use-immer";
import { cloneDeep } from "lodash-es";

export default function DraggableList ({ dataItems, onChange, renderItem }) {
    const [dragState, setDragState] = useImmer({
        dragIndex: null,
        insertIndex: null,
    });

    const dragStart = (e, index) => {
        e.dataTransfer.effectAllowed = "move";
        setDragState(draft => {
            draft.dragIndex = index;
        });
    };

    const dragEnterMarker = (e, index) => {
        e.preventDefault();
        setDragState(draft => {
            draft.insertIndex = index;
        });
    };

    const dragOver = (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
    };

    const drop = () => {
        const { dragIndex, insertIndex } = dragState;
        if (dragIndex == null || insertIndex == null) return;

        const items = cloneDeep(dataItems);
        const [moved] = items.splice(dragIndex, 1);

        // If dragging down, insertion index shifts after removal
        const adjustedIndex =
            insertIndex > dragIndex ? insertIndex - 1 : insertIndex;

        items.splice(adjustedIndex, 0, moved);

        setDragState(draft => {
            draft.dragIndex = null;
            draft.insertIndex = null;
        });

        onChange(items);
    };

    return (
        <div>
            {dataItems.map((item, i) => (
                <div key={i}>
                    {/* Marker before item */}
                    <div
                        key={`${i}-marker`}
                        className={`h-0.5 ${
                            dragState.insertIndex === i ? "bg-blue-400" : "bg-transparent"
                        }`}
                        onDragEnter={(e) => dragEnterMarker(e, i)}
                        onDragOver={dragOver}
                        onDrop={drop}
                    />

                    {/* Draggable item */}
                    <div
                        key={`${i}-item`}
                        draggable
                        onDragStart={(e) => dragStart(e, i)}
                        onDragOver={dragOver}
                        onDrop={drop}
                        className={dragState.dragIndex === i ? "bg-gray-50 opacity-50" : ""}
                    >
                        {renderItem({ item })}
                    </div>
                </div>
            ))}

            {/* Marker after last item */}
            <div
                key={`last-marker`}
                className={`h-0.5 ${
                    dragState.insertIndex === dataItems.length
                        ? "bg-blue-400"
                        : "bg-transparent"
                }`}
                onDragEnter={(e) => dragEnterMarker(e, dataItems.length)}
                onDragOver={dragOver}
                onDrop={drop}
            />
        </div>
    );
};