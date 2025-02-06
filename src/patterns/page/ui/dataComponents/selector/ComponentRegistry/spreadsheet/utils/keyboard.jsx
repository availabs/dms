export const handleKeyDown = ({
    e, dataLen, selection, setSelection, setIsSelecting,
    editing, setEditing, setTriggerSelectionDelete,
    visibleAttributes, pageSize, setIsDragging
}) => {
    if (e.shiftKey) {
        setIsDragging(true)
        let lastSelected = selection[selection.length - 1]; // [int or {index, attrI}]
        let attrIRange = selection.map(s => s.attrI).filter(s => s !== undefined).sort((a,b) => a-b);
        if(!attrIRange?.length){
            attrIRange = visibleAttributes.map((_, i) => i);
        }
        attrIRange = [...new Set(attrIRange)].sort((a,b) => a-b);
        let indexRange = [...new Set(selection.map(s => s.index !== undefined ? s.index : s))].sort((a,b) => a-b);

        if (typeof lastSelected === 'number') {
            lastSelected = { index: lastSelected, attrI: undefined };
        }

        switch (e.key) {
            case 'ArrowUp':
                if (lastSelected.index > 0) {
                    setSelection(prevSelection => {
                        const newindex = lastSelected.index - 1;
                        const newSelection = attrIRange.map(r => ({ index: newindex, attrI: r })); // for all attributes, add a selection
                        return prevSelection.find(sel => sel.index <= newindex)
                            ? prevSelection.filter(sel => !(sel.index > newindex))
                            : [...prevSelection, ...newSelection];
                    });
                }
                break;
            case 'ArrowDown':
                if (lastSelected.index < dataLen - 1) {
                    setSelection(prevSelection => {
                        const newindex = lastSelected.index + 1;
                        const newSelection = attrIRange.map(r => ({ index: newindex, attrI: r })); // for all attributes, add a selection
                        return prevSelection.find(sel => sel.index >= newindex)
                            ? prevSelection.filter(sel => !(sel.index < newindex))
                            : [...prevSelection, ...newSelection];
                    });
                }
                break;
            case 'ArrowLeft':
                if (lastSelected.attrI > 0) {
                    setSelection(prevSelection => {
                        const newattrI = lastSelected.attrI - 1;
                        const newSelection = indexRange.map(ir => ({ index: ir, attrI: newattrI }));
                        return prevSelection.find(sel => sel.attrI <= newattrI)
                            ? prevSelection.filter(sel => !(sel.attrI > newattrI))
                            : [...prevSelection, ...newSelection];
                    });
                }
                break;
            case 'ArrowRight':
                if (lastSelected.attrI < visibleAttributes.length - 1) {
                    setSelection(prevSelection => {
                        const newattrI = lastSelected.attrI + 1;
                        const newSelection = indexRange.map(ir => ({ index: ir, attrI: newattrI }));
                        return prevSelection.find(sel => sel.attrI >= newattrI)
                            ? prevSelection.filter(sel => !(sel.attrI < newattrI))
                            : [...prevSelection, ...newSelection];
                    });
                }
                break;
            default:
                break;
        }
    } else if (e.ctrlKey) {
        setIsSelecting(true);
    } else if (e.key === 'Delete'){
        setTriggerSelectionDelete(true)
    } else if (e.key === 'Escape'){
        setSelection([])
    } else if (e.key.includes('Arrow')){
        let {index, attrI} = typeof selection[selection.length - 1] === 'number' ?
            { index: selection[selection.length - 1], attrI: undefined } :
            selection[selection.length - 1];

        switch (e.key){
            case "ArrowUp":
                index > 0 && setSelection([{index: index - 1, attrI: attrI || 0}]);
                setEditing({})
                break;
            case "ArrowDown":
                index < Math.min(pageSize, dataLen) - 1 && setSelection([{index: index + 1, attrI: attrI || 0}]);
                setEditing({})
                break;
            case "ArrowLeft":
                attrI > 0 && setSelection([{index, attrI: attrI - 1}]);
                setEditing({})
                break;
            case "ArrowRight":
                attrI < visibleAttributes.length - 1 && setSelection([{index, attrI: attrI + 1}]);
                setEditing({})
                break;

        }
    } else if (e.key === 'Enter'){
        let {index, attrI} = typeof selection[selection.length - 1] === 'number' ?
            { index: selection[selection.length - 1], attrI: undefined } :
            selection[selection.length - 1];

        if(index === editing.index && attrI === editing.attrI){
            // move to cell below if editing
            setEditing({});
            setSelection([{index: index + 1, attrI}]);
        }else{
            // enter edit mode
            setEditing({index, attrI});
        }
    }
};