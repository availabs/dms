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
    allowFnSelector: ['card', 'spreadsheet', 'graph'].includes(compType),
    allowExcludeNASelector: ['card', 'spreadsheet', 'graph'].includes(compType),
    allowShowToggle: ['item', 'card', 'spreadsheet'].includes(compType),
    allowXAxisToggle: ['graph'].includes(compType),
    allowYAxisToggle: ['graph'].includes(compType),
    allowCategoriseToggle: ['graph'].includes(compType),
    allowFilterToggle: ['card', 'spreadsheet', 'filter', 'graph'].includes(compType),
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
    allowHeaderValuePaddingSelect: ['card'].includes(compType),
    allowBGColorSelector: ['card'].includes(compType),
    allowHideIfNullToggle: ['card'].includes(compType),
    allowRemoveBorderToggle: ['card'].includes(compType),
    allowHeaderValueLayoutSelect: ['card'].includes(compType),
    // ==========in header===============
    allowSortBy: ['spreadsheet', 'graph'].includes(compType),
    allowJustify: ['card', 'spreadsheet'].includes(compType),
    allowFormat: ['card', 'spreadsheet', 'graph'].includes(compType),
    allowHideHeader: ['card'].includes(compType),
    allowCardSpan: ['card'].includes(compType),
    allowFontStyleSelect: ['card'].includes(compType),
    allowFontWeight: ['card'].includes(compType),
    allowReverseToggle: ['card'].includes(compType),
    allowEditInViewToggle: ['item', 'spreadsheet'].includes(compType),
    allowLinkControl: ['card', 'spreadsheet'].includes(compType)
    // allowSearchParamsToggle: ['item', 'card', 'spreadsheet'].includes(compType),

    // allowDataSizeInput: ['spreadsheet'].includes(compType)
})