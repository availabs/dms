import { quantize } from "d3-interpolate"
import { get } from "lodash-es";

import {
	ordinalSchemes,
	ordinalRange,
	quantitativeSchemes,
	quantitativeScheme
} from "./rawPlotSchemes"

import {
	mapColors as availColorRanges,
	strictNaN
} from "./utils";

const quantitativeRange = (scheme, length) => {
	const s = quantitativeScheme(scheme);
	return quantize(s, length);
}

const capitalize = str => {
	return str[0].toUpperCase() + str.slice(1);
}

const SchemeNameMap = {
	br: "Brown",
	bg: "Blue-Green",
	pr: "Purple",
	gn: "Green",
	pi: "Pink",
	yg: "Yellow-Green",
	pu: "Purple",
	or: "Orange",
	rd: "Red",
	bu: "Blue",
	gy: "Gray",
	yl: "Yellow"
}
const regex = new RegExp(Object.keys(SchemeNameMap).join("|"));

const categoricalSchemes = new Set([
	"accent", "category10", "dark2", "observable10", "paired",
	"pastel1", "pastel2", "set1", "set2", "set3", "tableau10"
]);
const divergingSchemes = new Set([
	"brbg", "prgn", "piyg", "puor", "rdbu",
	"rdgy", "rdylbu", "rdylgn", "spectral"
]);
const sequentialSingleHueSchemes = new Set([
	"blues", "greens", "greys", "oranges", "purples", "reds"
]);
const sequentialMultiHueSchemes = new Set([
	"turbo", "viridis", "magma", "inferno", "plasma",
	"cividis", "cubehelix", "warm", "cool", "bugn",
	"bupu", "gnbu", "orrd", "pubu", "pubugn", "purd",
	"rdpu", "ylgn", "ylgnbu", "ylorbr", "ylorrd"
]);
const cyclicalSchemes = new Set(["rainbow", "sinebow"]);

const getSchemeType = scheme => {
	if (categoricalSchemes.has(scheme)) return "Categorical";
	if (divergingSchemes.has(scheme)) return "Diverging";
	if (sequentialSingleHueSchemes.has(scheme)) return "Single-Hue Sequential";
	if (sequentialMultiHueSchemes.has(scheme)) return "Multi-hue Sequential";
	if (cyclicalSchemes.has(scheme)) return "Cyclical";
}

export const SchemeOptions = [...ordinalSchemes.keys()].map(k => {

	const type = getSchemeType(k);

	if (k === "puor") {
		return { value: k, label: `(${ type }) Purple➔Brown` }
	}

	if (k.length === 4) {
		const c1 = k.slice(0, 2);
		const c2 = k.slice(2);

		if (regex.test(c1) && regex.test(c2)) {
			return { value: k, label: `(${ type }) ${ SchemeNameMap[c1] }➔${ SchemeNameMap[c2] }` }
		}
	}

	if (k.length === 6) {
		const c1 = k.slice(0, 2);
		const c2 = k.slice(2, 4);
		const c3 = k.slice(4);

		if (regex.test(c1) && regex.test(c2) && regex.test(c3)) {
			return {
				value: k,
				label: `(${ type }) ${ SchemeNameMap[c1] }➔${ SchemeNameMap[c2] }➔${ SchemeNameMap[c3] }`
			}
		}
	}

	return { value: k, label: `(${ type }) ${ capitalize(k) }` }
});

for (const k in availColorRanges) {
	if (k === "schemeGroups") continue;
	if (k === "div7") {
		SchemeOptions.push({ label: "(Categorical) AVAIL Categorical", value: k });
	}
	else if (k.startsWith("div")) {
		SchemeOptions.push({ label: `(Diverging) AVAIL ${ k }`, value: k });
	}
	else if (k.startsWith("seq")) {
		SchemeOptions.push({ label: `(Sequential) AVAIL ${ k }`, value: k });
	}
}

const DefaultOptions = {
	reverse: false,
	prefer: "quantitative"
}

export const getColorRange = (scheme, length, options = DefaultOptions) => {

	if (strictNaN(length)) {
		const temp = scheme;
		scheme = length;
		length = temp;
	}

	if (typeof options === "boolean") {
		const reverse = options;
		options = {
			...DefaultOptions,
			reverse
		}
	}

	const { reverse, prefer } = options;

console.log("colorSchemeUnifier::getColorRange::options", options);

	let range = [];

	if (scheme in availColorRanges) {
		range = get(availColorRanges, [scheme, length], []);
	}
	else if (quantitativeSchemes.has(scheme) && (prefer === "quantitative")) {
		range = quantitativeRange(scheme, length);
	}
	else if (ordinalSchemes.has(scheme)) {
		range = ordinalRange(scheme, length);
	}

	return reverse ? range.slice().reverse() : range.slice();
}