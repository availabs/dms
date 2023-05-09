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
		textarea: {
			viewWrapper: 'overflow-hidden p-2 bg-gray-100 border-b-2'
		},
		card: {
			wrapper: 'p-4',
			row: 'flex py-1',
			rowLabel: 'px-4 w-28 text-sm',
			rowContent: 'flex-1'
		}

	}
}

export default defaultTheme()