
import colorbrewer from "colorbrewer"
import get from "lodash/get"

const ColorRanges = {}

for (const type in colorbrewer.schemeGroups) {
	colorbrewer.schemeGroups[type].forEach(name => {
		const group = colorbrewer[name];
		for (const length in group) {
			if (!(length in ColorRanges)) {
				ColorRanges[length] = [];
			}
			ColorRanges[length].push({
				type: `${ type[0].toUpperCase() }${ type.slice(1) }`,
				name,
				category: "Colorbrewer",
				colors: group[length]
			})
		}
	})
}

export { ColorRanges };

export const getColorRange = (size, name) =>
	get(ColorRanges, [size], [])
		.reduce((a, c) => c.name === name ? c.colors : a, []).slice();