import {useCallback, useEffect} from "react";

export const useHandleClickOutside = (menuRef, menuBtnId, onClose) => {
    const handleClickOutside = useCallback(
        (e) => {
            if (
                menuRef.current &&
                !menuRef.current.contains(e.target) &&
                e.target.id !== menuBtnId
            ) {
                onClose();
            }
        },
        [menuRef, menuBtnId, onClose]
    );

    useEffect(() => {
        document.addEventListener('mousedown', handleClickOutside);
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [handleClickOutside]);
};

export const getControlConfig = compType => ({
    // ========main controls==============
    allowCustomColNames: ['card', 'spreadsheet'].includes(compType),
    allowFnSelector: ['card', 'spreadsheet'].includes(compType),
    allowExcludeNASelector: ['card', 'spreadsheet'].includes(compType),
    allowShowToggle: ['card', 'spreadsheet'].includes(compType),
    allowFilterToggle: ['card', 'spreadsheet'].includes(compType),
    allowGroupToggle: ['card', 'spreadsheet'].includes(compType),
    // spreadsheet only
    allowOpenOutToggle: ['spreadsheet'].includes(compType),

    // ==========in header===============
    allowSortBy: ['spreadsheet'].includes(compType),
    allowJustify: ['card', 'spreadsheet'].includes(compType),
    allowFormat: ['card', 'spreadsheet'].includes(compType),

    // card only
    allowHideHeader: ['card'].includes(compType),
    allowCardSpan: ['card'].includes(compType),
    allowFontSize: ['card'].includes(compType),
})