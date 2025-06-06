import {useEffect} from "react";

export function usePaste(callback, element) {
    useEffect(() => {
        if(!element) return;

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
    }, [callback, element]);
}

export function useCopy(callback, element) {
    useEffect(() => {
        if(!element) return;

        function handleCopy(event) {
            const dataToCopy = callback();
            // event.clipboardData.setData('text/plain', dataToCopy)
            return navigator.clipboard.writeText(dataToCopy)
        }

        element.addEventListener('copy', handleCopy);

        return () => {
            element.removeEventListener('copy', handleCopy);
        };
    }, [callback, element]);
}