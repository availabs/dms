// Preview fixtures for the theme editor's "Graph" pane
// (patterns/admin/pages/themes/editTheme.jsx). `compOptions` there has always
// listed Graph, but `ui/docs.js` had no entry for it, so the pane fell back to
// `UI['Graph']` with no props and drew nothing — an admin editing graph tokens
// saw an empty frame. These make the preview real, which is the whole
// justification for exposing the tokens (tune a value, see it, no report-page
// rebuild).
//
// Shape follows Icon.docs: an array of PROPS objects. editTheme resolves
// `componentDocs.Graph[idx].props || componentDocs.Graph[idx]`, so each entry
// IS the prop bag; `doc_name` only labels the dropdown.
//
// Static data on purpose — the graph section reads rows off `state.data` and
// does no fetching of its own, so a fixture needs no source, no dmsEnv and no
// network. Keep the two entries covering the two legend KINDS, since that is
// what the tokens differ on: a swatch list, and a colour ramp.

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// Two series so the categorical legend has something to key (a single series
// needs no legend at all). Values are plausible NPMRDS-style corridor speeds.
const BY_MONTH = [
	[41.2, 40.1, 42.6, 44.3, 45.1, 44.8, 43.9, 43.2, 42.7, 43.5, 41.8, 40.6],
	[38.4, 37.9, 39.8, 41.6, 42.9, 42.1, 41.3, 40.8, 40.2, 41.1, 39.4, 38.1]
];

const twoSeriesData = MONTHS.flatMap((month, i) => ([
	{ month, series: "Before", speed: BY_MONTH[0][i] },
	{ month, series: "After", speed: BY_MONTH[1][i] }
]));

const twoSeriesColumns = [
	{ name: "month", display: "data", target: "xAxis" },
	{ name: "speed", display: "data", target: "yAxis" },
	{ name: "series", display: "data", target: "categorize" }
];

const oneSeriesData = MONTHS.map((month, i) => ({ month, speed: BY_MONTH[0][i] }));

const oneSeriesColumns = [
	{ name: "month", display: "data", target: "xAxis" },
	{ name: "speed", display: "data", target: "yAxis" }
];

// The section component reads these off pageContext; nothing here publishes or
// subscribes, so they only need to exist and carry an empty filter list.
const pageContext = {
	pageState: { filters: [] },
	setActionParam: () => {},
	clearActionParam: () => {}
};

const base = { isEdit: false, setState: () => {}, pageContext };

export default [
	{
		doc_name: "Bar Graph · swatch legend",
		...base,
		state: {
			columns: twoSeriesColumns,
			data: twoSeriesData,
			display: {
				graphType: "BarGraph",
				height: 260,
				groupMode: "grouped",
				title: { title: "Average speed by month" },
				description: "Two series",
				legend: { show: true, position: "top", size: "medium" },
				xAxis: { label: "Month" },
				yAxis: { label: "mph", format: "Integer" }
			}
		}
	},
	{
		doc_name: "Bar Graph · colour ramp legend",
		...base,
		state: {
			columns: oneSeriesColumns,
			data: oneSeriesData,
			display: {
				graphType: "BarGraph",
				height: 260,
				title: { title: "Average speed by month" },
				// `byValue` is what switches the legend from a swatch list to a ramp
				// (see BarGraph.jsx's legend memo) — the case the gradient-legend
				// tokens actually style.
				colors: {
					type: "palette",
					byValue: true,
					value: ["#D6453B", "#E8843F", "#F2E18A", "#A8D26B", "#3FA34D"]
				},
				legend: { show: true, position: "top", size: "medium" },
				xAxis: { label: "Month" },
				yAxis: { label: "mph", format: "Integer" }
			}
		}
	}
];
