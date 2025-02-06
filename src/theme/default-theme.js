function defaultTheme () {
	return {
		landing: {
			wrapper: 'p-4 border-2 border-blue-300'
		},
		table: {
			'table': 'min-w-full divide-y divide-gray-300',
			'thead': '',
			'th': 'py-3.5 pl-4 pr-3 text-left text-sm font-semibold text-gray-900',
			'tbody': 'divide-y divide-gray-200 ',
			'td': 'whitespace-nowrap px-3 py-4 text-sm text-gray-500'
		},
		text: {
			input: 'px-2 py-1 w-full text-sm font-light border rounded-md focus:border-blue-300 bg-white focus:outline-none transition ease-in',
			view: 'text-sm font-light truncate bg-red-500'
		},
		textarea: {
			input: 'px-2 py-1 w-full text-sm font-light border rounded-md focus:border-blue-300 focus:outline-none transition ease-in',
			viewWrapper: 'whitespace-normal text-sm font-light'
		},
		select: {
			input: 'px-2 py-1 w-full text-sm font-light border rounded-md focus:border-blue-300 bg-white hover:bg-blue-100 transition ease-in',
			error: 'p-1 text-xs text-red-700 font-bold'
		},
		multiselect: {
			view: 'w-full h-full',
			mainWrapper: 'w-full h-full',
			inputWrapper: 'flex px-2 py-1 w-full text-sm font-light border focus:border-blue-300 rounded-md bg-white hover:bg-blue-100 transition ease-in',
			input: 'w-full px-2 border rounded-lg focus:outline-none',
			tokenWrapper: 'w-fit flex m-0.5 px-2 py-1 mx-1 bg-blue-500/15 text-blue-700 hover:bg-blue-500/25 rounded-md transition ease-in',
			removeIcon: 'fa fa-xmark px-1 text-xs text-red-500 hover:text-red-600 self-center cursor-pointer transition ease-in',
			menuWrapper: 'absolute p-2 bg-white w-full max-h-[150px] overflow-auto scrollbar-sm shadow-lg z-10 rounded-lg',
			menuItem: 'px-2 py-1 text-sm hover:bg-blue-300 hover:cursor-pointer transition ease-in rounded-md',
			smartMenuWrapper: 'w-full h-full flex flex-wrap',
			smartMenuItem: 'w-fit px-1 py-0.5 m-1 bg-blue-100 hover:bg-blue-300 hover:cursor-pointer transition ease-in border rounded-lg text-xs',
			error: 'p-1 text-xs text-red-700 font-bold'
		},
		radio: {
			wrapper: 'p-1 flex',
			input: 'self-center p-1',
			label: 'text-sm font-light p-1 self-center',
			error: 'text-xs text-red-700 font-bold'
		},
		card: {
			wrapper: 'p-4',
			rowHeader: 'w-full flex flex-row justify-between',
			infoIcon: 'p-2 fad fa-info text-blue-300 hover:text-blue-400',

			row: 'flex py-1 flex-col p-2 mt-3',
			rowLabel: 'w-full text-sm font-light mb-2 capitalize',
			rowContent: 'flex-1',

			btnWrapper: 'w-full flex justify-end',
			continueBtn: 'p-2 m-1 bg-blue-300 hover:bg-blue-500 disabled:bg-blue-300 text-white rounded-md transition ease-in',
			backBtn: 'p-2 m-1 bg-blue-300 hover:bg-blue-500 disabled:bg-blue-300 text-white rounded-md transition ease-in',
			submitBtn: 'p-2 m-1 bg-blue-300 hover:bg-blue-500 text-white rounded-md transition ease-in',
		},
		form: {
			tabpanelWrapper: 'flex',
			tabWrapper: 'flex p-3 w-full',
			tabActive: 'w-full p-1 border-b-2 flex flex-col text-center border-blue-300 transition ease-in',
			tab: 'group w-full p-1 border-b-2 flex flex-col text-center hover:bg-blue-300 transition ease-in',
			icon: '',
			tabTitle: 'text-xs font-bold text-blue-500 group-hover:text-white',
			tabSubtitle: 'text-sm font-light text-blue-500 group-hover:text-white',
			contentWrapper: 'flex',

			// view
			sectionsWrapper: 'columns-2 gap-2',
			sections: 'w-full h-fit shadow-md mb-4 border',
			card: {
				wrapper: 'divide-y-2',
				row: 'flex py-1 flex-row hover:bg-blue-50 space-between p-2',
				rowLabel: 'w-1/4 text-xs text-gray-600 font-medium mb-2 capitalize',
				rowContent: 'pl-2 w-3/4 text-sm',
			}
		}
	}
}

export default defaultTheme()