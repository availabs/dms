// SearchButton Theme
export const searchButtonTheme = {
  "options": {
    "activeStyle": 0
  },
  "styles": [{
    "name": "default",
    // Button container
    "button": `
      bg-white flex justify-between items-center
      h-[48px] w-[217px] py-[8px] pr-[8px] pl-[24px]
      border border-[#E0EBF0] rounded-[1000px]
      shadow-sm transition ease-in
    `,
    // Button text
    "buttonText": "uppercase text-[#2D3E4C] font-medium text-[12px] leading-[14.62px] tracking-none",
    // Icon wrapper
    "iconWrapper": "bg-[#37576B] p-[10px] rounded-full",
    // Icon
    "icon": "Search",
    "iconClass": "text-white",
    "iconSize": 12
  }]
}

// SearchPallet Theme
export const searchPalletTheme = {
  "options": {
    "activeStyle": 0
  },
  "styles": [{
    "name": "default",
    // Dialog backdrop
    "backdrop": "fixed inset-0 bg-black bg-opacity-[60%] transition-opacity",
    // Dialog container
    "dialogContainer": "fixed inset-0 z-20 w-screen overflow-y-auto p-4 sm:p-6 md:p-20 flex items-center place-content-center",
    // Dialog panel
    "dialogPanel": "relative max-w-3xl sm:w-[637px] max-h-3/4 sm:h-[700px] p-[16px] flex flex-col gap-[8px] overflow-hidden rounded-[12px] bg-[#F3F8F9] transition-all",

    // Search input area
    "inputWrapper": "w-full flex items-center relative px-[24px] py-[16px] bg-white w-full rounded-full border border-[#E0EBF0]",
    "input": "px-0.5 flex-1 font-[Proxima Nova] font-normal text-[16px] text-[#2D3E4C] leading-[140%] bg-transparent focus:ring-0 sm:text-sm rounded-full ring-0 outline-none",
    "searchIconWrapper": "p-0.5",
    "searchIcon": "Search",
    "searchIconClass": "text-[#2D3E4C]",

    // Results area
    "resultsWrapper": "bg-white rounded-[12px] px-[12px] py-[24px] flex flex-col gap-[8px] divide-y divide-[#E0EBF0] max-h-[500px] transform-gpu scroll-py-3 overflow-x-hidden overflow-y-auto scrollbar-sm",
    "resultItemWrapper": "flex flex-col gap-[12px] pb-[12px] w-full select-none rounded-[12px] transition ease-in",
    "resultItemOuter": "select-none pt-[12px]",

    // Page result
    "pageResultWrapper": "group w-full flex items-center text-xl font-medium text-gray-700 hover:text-gray-700 cursor-pointer",
    "pageIcon": "DraftPage",
    "pageIconWidth": 15,
    "pageIconHeight": 21,
    "pageTitle": "pl-2 font-[Oswald] font-medium text-[16px] leading-[100%] uppercase text-[#2D3E4C]",
    "pageArrowIcon": "ArrowRight",
    "pageArrowClass": "h-6 w-6 ml-2 text-transparent group-hover:text-gray-900",

    // Sections
    "sectionsWrapper": "ml-3 pl-4 flex flex-col gap-[12px]",
    "sectionItemWrapper": "w-full cursor-pointer group",
    "sectionTitleWrapper": "w-full flex items-center text-md font-medium text-gray-700 hover:text-gray-700",
    "sectionIcon": "Section",
    "sectionIconWidth": 18,
    "sectionIconHeight": 18,
    "sectionTitle": "pl-1 font-[Proxima Nova] font-normal text-[16px] leading-[140%] tracking-normal",
    "sectionArrowClass": "h-6 w-6 ml-2 text-transparent group-hover:text-gray-900",

    // Tags
    "tagsWrapper": "w-full ml-8",
    "tag": "tracking-wide p-1 text-xs text-white font-semibold rounded-md border",
    "tagMatch": "border-1 border-red-600 bg-red-400",
    "tagNoMatch": "bg-red-300",

    // Suggestions
    "suggestionsWrapper": "flex items-center max-h-96 transform-gpu scroll-py-3 overflow-y-auto p-3",
    "suggestionsLabel": "text-xs italic",
    "suggestionItem": "flex cursor-pointer select-none hover:bg-gray-100 rounded-xl p-1",
    "suggestionTagIcon": "text-xs text-red-400 fa fa-tag",
    "suggestionTagText": "ml-2 text-sm font-medium text-gray-700",
    "suggestionTagTextFocus": "ml-2 text-sm font-medium text-gray-900",

    // Loading state
    "loadingWrapper": "p-2 mx-auto w-1/4 h-full flex items-center justify-middle",
    "loadingIcon": "px-2 fa fa-loader text-gray-400",
    "loadingText": "font-semibold text-gray-900",

    // No results state
    "noResultsWrapper": "px-6 py-14 text-center text-sm sm:px-14",
    "noResultsIcon": "fa fa-exclamation mx-auto h-6 w-6 text-gray-400",
    "noResultsTitle": "mt-4 font-semibold text-gray-900",
    "noResultsText": "mt-2 text-gray-500"
  }]
}

// Settings for admin UI
export const searchButtonSettings = (theme) => {
  const activeStyle = theme?.pages?.searchButton?.options?.activeStyle || 0
  return [
    {
      label: "Search Button Styles",
      type: 'inline',
      controls: [
        {
          label: 'Style',
          type: 'Select',
          options: (theme?.pages?.searchButton?.styles || [{}])
            .map((k, i) => ({ label: k?.name || i, value: i })),
          path: `pages.searchButton.options.activeStyle`,
        },
        {
          label: 'button',
          type: 'Textarea',
          path: `pages.searchButton.styles[${activeStyle}].button`
        },
        {
          label: 'buttonText',
          type: 'Textarea',
          path: `pages.searchButton.styles[${activeStyle}].buttonText`
        },
        {
          label: 'iconWrapper',
          type: 'Textarea',
          path: `pages.searchButton.styles[${activeStyle}].iconWrapper`
        },
        {
          label: 'icon',
          type: 'Input',
          path: `pages.searchButton.styles[${activeStyle}].icon`
        },
      ]
    }
  ]
}

export const searchPalletSettings = (theme) => {
  const activeStyle = theme?.pages?.searchPallet?.options?.activeStyle || 0
  return [
    {
      label: "Search Pallet Styles",
      type: 'inline',
      controls: [
        {
          label: 'Style',
          type: 'Select',
          options: (theme?.pages?.searchPallet?.styles || [{}])
            .map((k, i) => ({ label: k?.name || i, value: i })),
          path: `pages.searchPallet.options.activeStyle`,
        },
      ]
    },
    {
      label: "Dialog",
      type: 'inline',
      controls: [
        {
          label: 'backdrop',
          type: 'Textarea',
          path: `pages.searchPallet.styles[${activeStyle}].backdrop`
        },
        {
          label: 'dialogContainer',
          type: 'Textarea',
          path: `pages.searchPallet.styles[${activeStyle}].dialogContainer`
        },
        {
          label: 'dialogPanel',
          type: 'Textarea',
          path: `pages.searchPallet.styles[${activeStyle}].dialogPanel`
        },
      ]
    },
    {
      label: "Input",
      type: 'inline',
      controls: [
        {
          label: 'inputWrapper',
          type: 'Textarea',
          path: `pages.searchPallet.styles[${activeStyle}].inputWrapper`
        },
        {
          label: 'input',
          type: 'Textarea',
          path: `pages.searchPallet.styles[${activeStyle}].input`
        },
      ]
    },
    {
      label: "Results",
      type: 'inline',
      controls: [
        {
          label: 'resultsWrapper',
          type: 'Textarea',
          path: `pages.searchPallet.styles[${activeStyle}].resultsWrapper`
        },
        {
          label: 'resultItemWrapper',
          type: 'Textarea',
          path: `pages.searchPallet.styles[${activeStyle}].resultItemWrapper`
        },
        {
          label: 'pageTitle',
          type: 'Textarea',
          path: `pages.searchPallet.styles[${activeStyle}].pageTitle`
        },
        {
          label: 'sectionTitle',
          type: 'Textarea',
          path: `pages.searchPallet.styles[${activeStyle}].sectionTitle`
        },
      ]
    }
  ]
}
