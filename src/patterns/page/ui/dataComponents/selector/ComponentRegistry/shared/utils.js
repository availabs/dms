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
    allowCustomColNames: ['item', 'card', 'spreadsheet'].includes(compType),
    allowFnSelector: ['card', 'spreadsheet'].includes(compType),
    allowExcludeNASelector: ['card', 'spreadsheet'].includes(compType),
    allowShowToggle: ['item', 'card', 'spreadsheet'].includes(compType),
    allowFilterToggle: ['card', 'spreadsheet', 'filter'].includes(compType),
    allowGroupToggle: ['card', 'spreadsheet'].includes(compType),
    allowOpenOutToggle: ['spreadsheet'].includes(compType),
    allowShowTotalToggle: ['spreadsheet'].includes(compType),
    allowStripedToggle: ['spreadsheet'].includes(compType),
    allowDownloadToggle: ['spreadsheet'].includes(compType),
    allowUsePaginationToggle: ['spreadsheet'].includes(compType),
    allowPageSizeInput: ['spreadsheet', 'card'].includes(compType),
    allowCompactViewToggle: ['card'].includes(compType),
    allowGridSizeSelect: ['card'].includes(compType),
    allowGridGapSelect: ['card'].includes(compType),
    allowHeaderValueLayoutSelect: ['card'].includes(compType),

    // ==========in header===============
    allowSortBy: ['spreadsheet'].includes(compType),
    allowJustify: ['card', 'spreadsheet'].includes(compType),
    allowFormat: ['card', 'spreadsheet'].includes(compType),
    allowHideHeader: ['card'].includes(compType),
    allowCardSpan: ['card'].includes(compType),
    allowFontSize: ['card'].includes(compType),
    allowEditInViewToggle: ['item', 'spreadsheet'].includes(compType),
    // allowSearchParamsToggle: ['item', 'card', 'spreadsheet'].includes(compType),

    // allowDataSizeInput: ['spreadsheet'].includes(compType)
})