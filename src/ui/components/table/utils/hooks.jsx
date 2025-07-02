import {useEffect} from "react";

export const getLocation = selectionPoint => {
    let {index, attrI} = typeof selectionPoint === 'number' ? {
        index: selectionPoint,
        attrI: undefined
    } : selectionPoint;
    return {index, attrI}
}
export function usePaste(callback, element, isActive) {
    useEffect(() => {
        if(!element || !isActive) return;

        function handlePaste(event) {
            const pastedText = event.clipboardData.getData('Text');
            if (pastedText) {
                callback(pastedText, event);
            }
        }

        element.addEventListener('paste', handlePaste);

        return () => {
            element.removeEventListener('paste', handlePaste);
        };
    }, [callback, element, isActive]);
}

export function useCopy(callback, element, isActive) {
    return useEffect(() => {
        if (!element || !isActive) return;

        function handleCopy(event) {
            const dataToCopy = callback();
            if (event.clipboardData) {
                event.preventDefault(); // to override clipboard
                event.clipboardData.setData('text/plain', dataToCopy);
            } else {
                navigator.clipboard.writeText(dataToCopy).catch(console.error);
            }
        }

        element.addEventListener('copy', handleCopy);
        return () => {
            element.removeEventListener('copy', handleCopy);
        };
    }, [callback, element, isActive]);
}
