export const handleMouseDown = ({e, index, attrI, setSelection, setIsDragging, startCellCol, startCellRow, selection}) => {
    if(attrI !== undefined /*&& e.ctrlKey*/) {
        setSelection([{index, attrI}]);
        setIsDragging(true)
        startCellRow.current = index;
        startCellCol.current = attrI
        return;
    }

    if(attrI !== undefined) return;

    if (e.ctrlKey) {
        // Toggle selection with ctrl key
        e.preventDefault();
        setSelection(selection.includes(index) ? selection.filter(v => v !== index) : [...selection, index]);
        setIsDragging(true);
        startCellRow.current = index;
    } else {
        // Start dragging selection
        setSelection([index]);
        setIsDragging(true);
        startCellRow.current = index;
    }
};

export const handleMouseMove = ({e, index, attrI, isDragging, startCellCol, startCellRow, setSelection}) => {
    if(/*e.ctrlKey && */attrI !== undefined && isDragging) {
        // Determine the range

        const rangeRow = [startCellRow.current, index].sort((a, b) => a - b);
        const rangeCol = [startCellCol.current, attrI].sort((a, b) => a - b);
        const newSelection = [];
        for (let i = rangeRow[0]; i <= rangeRow[1]; i++) {
            for (let j = rangeCol[0]; j <= rangeCol[1]; j++) {
                newSelection.push({index: i, attrI: j});
            }
        }
        setSelection(newSelection);
        return;
    }
    if (isDragging) {
        // Determine the range
        const endCellIndex = index;
        const range = [startCellRow.current, endCellIndex].sort((a, b) => a - b);
        const newSelection = [];
        for (let i = range[0]; i <= range[1]; i++) {
            newSelection.push(i);
        }
        setSelection(newSelection);
    }
};

export const handleMouseUp = ({setIsDragging}) => {
    // Stop dragging
    setIsDragging(false);
};