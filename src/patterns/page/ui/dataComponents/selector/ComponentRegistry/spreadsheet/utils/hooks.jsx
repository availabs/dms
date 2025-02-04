import {useEffect} from "react";

export function usePaste(callback) {
    useEffect(() => {
        function handlePaste(event) {
            const pastedText = event.clipboardData.getData('Text');
            if (pastedText) {
                callback(pastedText, event);
            }
        }

        window.addEventListener('paste', handlePaste);

        return () => {
            window.removeEventListener('paste', handlePaste);
        };
    }, [callback]);
}

export function useCopy(callback) {
    useEffect(() => {
        function handleCopy(event) {
            const dataToCopy = callback();
            // event.clipboardData.setData('text/plain', dataToCopy)
            return navigator.clipboard.writeText(dataToCopy)
        }

        window.addEventListener('copy', handleCopy);

        return () => {
            window.removeEventListener('copy', handleCopy);
        };
    }, [callback]);
}