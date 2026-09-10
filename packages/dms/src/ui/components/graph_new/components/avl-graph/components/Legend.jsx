import React from "react"

import { scaleLinear } from "d3-scale"

const identity = d => d;

const SizeMap = {
	medium: [250, 30, "text-xs"],
	large: [400, 40, "text-sm"]
}

// ── Layer A: theme class-string tokens ─────────────────────────────────────
// `classNames` ({ row, swatch, label, tick, ramp }) is injected by GraphComponent, not read
// from a theme here: which avlGraph style is live is decided per-section by `activeStyle`,
// which the legend never sees. Two rules govern every token below, and both are load-bearing.
//
//   1. UNSET ⇒ the historical literal, byte for byte. Roughly 7,415 MitigateNY graphs render
//      a legend and not one of them sets a token; `tests/legendLegacyProps.test.js` locks the
//      exact rendered markup so this can't drift by accident.
//   2. A token replaces LOOK, never STRUCTURE. `absolute`, `whitespace-nowrap`, `min-w-0`,
//      `truncate`, `shrink-0` and the grid/flex orientation classes stay component-owned — a
//      brand must not be able to drop them and reintroduce the label clipping that the
//      geometry pass just fixed.
//
// Tailwind footgun, stated because this repo has already been bitten by it: these are class
// strings, not CSS declarations. A token that repeats a utility its fallback also sets (two
// `gap-*`, two `h-*`) is resolved by the generated stylesheet's rule order, NOT by which one
// sits later in the attribute. Author a token as a COMPLETE replacement for the look it names.
//
// `row` IS THE CATEGORICAL LEGEND'S ROW OF ITEMS, and is deliberately NOT applied to the two
// linear (gradient) legends. Caught live 2026-09-10, on the first render after these tokens were
// wired: transportny had authored `legend: "flex items-center gap-4 …"` years earlier as dead
// scaffolding, describing a chip row. Landing `flex` on the gradient container made the ramp — a
// `width: 100%` block — into a shrink-wrapping flex item, so it no longer spanned the box the
// absolutely-positioned tick labels are positioned against, and the labels fell back on top of
// the colour. That is precisely the defect the geometry pass existed to remove. A brand cannot
// know which legend variant its token will land on, so the gradient legend's container stays
// component-owned; its typography is reachable through `tick`, and its ramp through `ramp`.
const look = (token, fallback) => token || fallback;

const VerticalCategoricalLegendItem = props => {

	const {
		label,
		color,
		doHighlight = false,
		onEnter,
		onLeave,
		classNames = {}
	} = props;

	const doOnEnter = React.useCallback(e => {
		e.stopPropagation();
		if (typeof onEnter !== "function") return;
		onEnter(label);
	}, [onEnter, label]);

	const doOnLeave = React.useCallback(e => {
		e.stopPropagation();
		if (typeof onLeave !== "function") return;
		onLeave(null);
	}, [onLeave, label]);

	return (
		<div
			className={ `
				flex items-center px-1 min-w-0
				${ doHighlight ? "outline outline-2 outline-offset-1 rounded" : "" }
			` }
			onMouseEnter={ doOnEnter }
			onMouseLeave={ doOnLeave }
		>
			{ /* `flex-shrink-0` is structural and stays outside the token: a swatch that can
			   shrink collapses to nothing in a tight row. The look — size, radius, gap — is
			   the brand's (transportny authors a thin `h-0.5 w-4` rule rather than a block). */ }
			<div className={ `${ look(classNames.swatch, "w-4 h-4 rounded mr-1") } flex-shrink-0` }
				style={ {
					backgroundColor: doHighlight ? "red" : color
				} }/>
			{ /* min-w-0 + truncate only ever clip anything once an ancestor
			   actually constrains this item's width (see useLegendSqueezeGuard) —
			   inert, and identical to today's render, otherwise. */ }
			<div className={ `min-w-0 truncate${ classNames.label ? ` ${ classNames.label }` : "" }` } title={ label }>
				{ label }
			</div>
		</div>
	)
}

const CategoricalLegend = props => {

	const {
		categories = [],
		colors = [],
		colorsByKey,
		actions = [],
		orientation = "vertical",
		classNames = {},
		...rest
	} = props;

	// An explicit per-key color (e.g. a comparison-series variant's identity
	// color) wins over the positional swatch — keeps the legend in sync with
	// the chart's own colorFunc resolution (see avl-graph/utils's getColorFunc).
	const categoriesAndColors = React.useMemo(() => {
		const l = colors.length;
		return categories.map((cat, i) => {
			const color = (colorsByKey && colorsByKey[cat] != null) ? colorsByKey[cat] : colors[i % l];
			return [cat, color];
		}).reverse();
	}, [categories, colors, colorsByKey]);

// console.log("VerticalCategoricalLegend::actions", actions);

	const catsToHiglight = React.useMemo(() => {
		return actions.reduce((a, c) => {
			if (c.action === "hover_highlight") {
				for (const v of c.value) {
					a.add(v);
				}
			}
			return a;
		}, new Set());
	}, [actions]);

// console.log("VerticalCategoricalLegend::catsToHiglight", catsToHiglight);

	// Layout (`grid` vs `flex`) is the ORIENTATION contract and stays ours; `row` supplies the
	// brand's own spacing and typography in its place. Written as two whole strings rather than
	// assembled from parts, so the unset case is visibly the exact historical literal.
	return (
		<div className={ orientation === "horizontal"
				? (classNames.row ? `${ classNames.row } flex flex-wrap items-center justify-left` : "px-4 flex flex-wrap items-center justify-left gap-2")
				: (classNames.row ? `${ classNames.row } grid grid-cols-1` : "px-4 grid grid-cols-1 gap-1") }>
			{ categoriesAndColors.map(([cat, color]) =>
					<VerticalCategoricalLegendItem key={ cat }
						{ ...rest }
						classNames={ classNames }
						label={ cat }
						color={ color }
						doHighlight={ catsToHiglight.has(cat) }/>
				)
		}
		</div>
	)
}

// ── Linear (gradient) legend geometry ──────────────────────────────────────
// Both linear legends used to declare a box and then draw OUTSIDE it. The
// terminal tick's label sat at `scale(max) + 4px` — 4px past the container's own
// right edge, plus its full text width — and the vertical variant laid out
// (count - 1) full-height cells PLUS one more tick, overflowing its declared
// height by one tick. Every report card is rounded, and a rounded section chrome
// box clips (see sectionArray.jsx's sectionChrome), so this was a hard clip
// rather than a tight margin. GridGraph's own default formatter emits strings
// like "14.06 min" (~54px wide), so the clipped amount was ~42px, not a hairline.
//
// Fixed by ANCHORING, not by reserving a margin: the first tick's label aligns to
// the start of the ramp, the last to its end, interior ones centre on their mark.
// That holds for any label length on every site with nothing to configure —
// which matters, because no other site would ever set a margin token.
//
// Two things fall out of it:
//   • Nothing is drawn ON the gradient any more. The tick marks used to cross the
//     ramp in `currentColor` — mid-slate over amber and pale yellow, effectively
//     unreadable (reported 2026-09-10). Contrast against a gradient can't be
//     fixed by choosing a better colour, since the background is five colours, so
//     the legend is now three bands: ramp, mark gutter, labels.
//   • Tick positions are PERCENTAGES, not pixels, so the ramp can be sized as
//     min(SizeMap width, 100%) and still place its ticks correctly without
//     measuring anything. A fixed 250px ramp overflowed a size-4 report card
//     (~244px of content width) and crowded out an inline graph title.
//
// SizeMap itself is unchanged; what changed is how its numbers are APPLIED. [0]
// is now a MAX width rather than a fixed one, and [1] still sets the ramp's
// thickness (half of it, as before) but no longer doubles as the whole legend's
// height — that is derived from the three bands, which is the property that makes
// the declared box equal the rendered box.
const TICK_GUTTER = 4;
const LABEL_LINE = { medium: 16, large: 20 };
const LABEL_FONT_PX = { medium: 12, large: 14 };
// Rough advance width per character for the tick numerals, used ONLY to decide
// how many ticks fit. A wrong guess costs a tick, never a clipped label — the
// anchoring above is what keeps labels inside the box.
const CHAR_W = 0.62;
const MIN_TICK_GAP = 8;

// Evenly spaced domain stops. `count === 5` reproduces the historical
// [min, p25, p50, p75, max] exactly, so a legend with room for five ticks renders
// as it did before this change.
const rampTicks = (scale, count) => {
	const domain = scale.domain();
	const min = domain.at(0);
	const max = domain.at(-1);
	if (count <= 2) return [min, max];
	const diff = max - min;
	return Array.from({ length: count }, (_, i) => min + (diff * i) / (count - 1));
}

// Drop 5 → 3 → 2 ticks rather than letting labels collide on a narrow card.
// Estimated rather than measured: a DOM measurement here would cost a layout pass
// per render, and being wrong costs one tick.
const fitRampTicks = (scale, format, fontPx, available) => {
	for (const count of [5, 3]) {
		const values = rampTicks(scale, count);
		const text = values.reduce((a, v) => a + String(format(v)).length * fontPx * CHAR_W, 0);
		if (text + (values.length - 1) * MIN_TICK_GAP <= available) return values;
	}
	return rampTicks(scale, 2);
}

const VerticalLinearLegend = ({ size, scale = scaleLinear(), format = identity, classNames = {} }) => {

	const [height, cross] = React.useMemo(() => {
		return SizeMap[size] || SizeMap["medium"];
	}, [size]);

	const rampThickness = cross * 0.5;

	// The vertical variant has room for its labels (they stack down the side), so
	// it keeps all five ticks. Only the overflow is fixed here — by anchoring the
	// first and last labels inside the box instead of laying out one cell too many.
	const ticks = React.useMemo(() => rampTicks(scale, 5), [scale]);

	return (
		<div className="relative flex w-fit"
			style={ {
				height: `${ height }px`
			} }
		>
			<div
				className={ `${ look(classNames.ramp, "rounded") } shrink-0` }
				style={ {
					background: `linear-gradient(to bottom, ${ scale.range() })`,
					width: `${ rampThickness }px`,
					height: "100%"
				} }/>

			{ /* Mark gutter — beside the ramp, deliberately not across it. */ }
			{ ticks.map((t, i) =>
					<div key={ `mark-${ i }` }
						className="absolute border-t-1 border-b-1 border-current pointer-events-none"
						style={ {
							left: `${ rampThickness }px`,
							width: `${ TICK_GUTTER }px`,
							top: `${ (i / (ticks.length - 1)) * 100 }%`,
							transform: "translateY(-1px)"
						} }/>
				)
			}

			<div className="relative shrink-0"
				style={ { marginLeft: `${ TICK_GUTTER }px` } }
			>
				{ ticks.map((t, i) =>
						<div key={ i }
							className={ `absolute whitespace-nowrap ${ look(classNames.tick, "tabular-nums") }` }
							style={ {
								top: `${ (i / (ticks.length - 1)) * 100 }%`,
								transform: i === 0 ? "translateY(0)" :
									i === ticks.length - 1 ? "translateY(-100%)" :
										"translateY(-50%)"
							} }
						>
							{ format(t) }
						</div>
					)
				}
			</div>
		</div>
	)
}

const HorizontalLinearLegend = ({ size, scale = scaleLinear(), format = identity, classNames = {} }) => {

	const [maxWidth, cross] = React.useMemo(() => {
		return SizeMap[size] || SizeMap["medium"];
	}, [size]);

	const rampThickness = cross * 0.5;
	const labelLine = LABEL_LINE[size] || LABEL_LINE["medium"];
	const fontPx = LABEL_FONT_PX[size] || LABEL_FONT_PX["medium"];

	const ticks = React.useMemo(() => {
		return fitRampTicks(scale, format, fontPx, maxWidth);
	}, [scale, format, fontPx, maxWidth]);

	return (
		<div className="relative w-full min-w-0"
			style={ {
				// Width comes from the wrapper in `Legend` below (which is the actual flex
				// item in the graph's header row) — this box just fills it, so the tick
				// percentages below stay correct at any width.
				height: `${ rampThickness + TICK_GUTTER + labelLine }px`
			} }
		>
			<div
				className={ look(classNames.ramp, "rounded") }
				style={ {
					background: `linear-gradient(to right, ${ scale.range() })`,
					width: "100%",
					height: `${ rampThickness }px`
				} }/>

			{ ticks.map((t, i) => {
					const pct = (i / (ticks.length - 1)) * 100;
					return (
						<React.Fragment key={ i }>
							{ /* Mark gutter — below the ramp, never across it. */ }
							<div className="absolute border-l-1 border-r-1 border-current pointer-events-none"
								style={ {
									left: `${ pct }%`,
									top: `${ rampThickness }px`,
									height: `${ TICK_GUTTER }px`,
									transform: "translateX(-1px)"
								} }/>
							<div className={ `absolute whitespace-nowrap ${ look(classNames.tick, "tabular-nums") }` }
								style={ {
									left: `${ pct }%`,
									top: `${ rampThickness + TICK_GUTTER }px`,
									// The whole fix for the clipped terminal label: ends anchor
									// inward, interior ticks centre on their mark.
									transform: i === 0 ? "translateX(0)" :
										i === ticks.length - 1 ? "translateX(-100%)" :
											"translateX(-50%)"
								} }
							>
								{ format(t) }
							</div>
						</React.Fragment>
					)
				})
			}
		</div>
	)
}

const getLegend = (type, orientation) =>
	type === "categorical" ? CategoricalLegend :
		orientation === "vertical" ? VerticalLinearLegend :
																	HorizontalLinearLegend;

export const Legend = props => {
	const { type, orientation = "horizontal", size = "medium", ...rest } = props;

// console.log("Legend::type, orientation", type, orientation)

	const Legend = React.useMemo(() => {
		return getLegend(type, orientation);
	}, [type, orientation]);

	const textSize = React.useMemo(() => {
		return (SizeMap[size] || SizeMap["medium"])[2];
	}, [size]);

	// This wrapper is the actual flex item in the graph's header/footer row, so it is
	// where the horizontal gradient legend's width has to be decided. Two reasons it
	// can't be left to size itself:
	//   • An auto-width flex item shrink-wraps to its content, and that legend's
	//     content is absolutely positioned — it would collapse to nothing.
	//   • `width:100% + max-width` looks like the obvious answer and is WRONG: per the
	//     flexbox algorithm an item clamped by max-width is frozen at that cap, so it
	//     stops participating in shrinking. Measured live at a 640px viewport (row
	//     ~286px): the legend sat at its full 250px and the graph TITLE collapsed to
	//     24px instead — the legend won the negotiation, which is the exact bug this
	//     was meant to fix.
	// `flex-basis` gives the same preferred width without the freeze: grow 0 so it
	// never exceeds the ramp's natural size, shrink 1 so a tight row takes it below.
	// Net effect min(natural, available), with the title no longer paying for it. The
	// `width`/`maxWidth` pair is the fallback for a non-flex parent.
	//
	// Deliberately scoped to this one case: the categorical legend shrink-wraps by
	// design (its width IS its content, and useLegendSqueezeGuard caps it when that
	// gets out of hand) and the vertical variant is already content-width — both keep
	// the historical bare-`textSize` wrapper.
	const isHorizontalLinear = type !== "categorical" && orientation !== "vertical";
	const naturalWidth = (SizeMap[size] || SizeMap["medium"])[0];

	// A linear legend is a key to a COLOUR RAMP — with no usable ramp there is nothing
	// to key, so render nothing rather than a legend that lies.
	//
	// It used to lie. `buildValueColorScale` (components/utils.js) returns `undefined`
	// when the domain isn't finite or the palette is empty — which is what happens
	// whenever a graph has no data — and both callers pass that straight through as
	// `scale`. The linear renderers' `scale = scaleLinear()` DEFAULT PARAMETER then
	// swallowed it, and d3's default scale has domain AND range `[0, 1]`: the legend
	// rendered ticks "0 / 0.25 / 0.5 / 0.75 / 1" — five invented numbers with no
	// relation to the measure — beside a bar whose `linear-gradient(to right, 0,1)` is
	// invalid CSS the browser silently drops. So a blank graph got a confident-looking
	// key to a scale that never existed. Observed live 2026-09-10 on
	// `reports/snapshot` (BarGraph, colors.byValue) and `reports/seasonality` (8
	// GridGraphs), and reproduced with this file reverted to HEAD, so it long predates
	// the legend-geometry work.
	//
	// The range check is what actually catches it: a real ramp's range is CSS colour
	// strings, d3's default is numbers. Nothing is rendered in the failure case
	// because the chart's own empty state already reports the missing data, and there
	// is no honest label to put here — "No data" would be wrong for the other way this
	// can fail (real data, empty palette).
	const scaleForRamp = rest.scale;
	const rampRange = (isHorizontalLinear || orientation === "vertical") && typeof scaleForRamp?.range === "function"
		? scaleForRamp.range()
		: null;
	const hasColourRamp = type === "categorical" || (
		typeof scaleForRamp?.domain === "function" &&
		Array.isArray(rampRange) && rampRange.length > 0 &&
		rampRange.every(v => typeof v === "string")
	);
	if (!hasColourRamp) return null;

	return (
		<div className={ `${ textSize }${ isHorizontalLinear ? " min-w-0" : "" }` }
			style={ isHorizontalLinear ? {
				flexBasis: `${ naturalWidth }px`,
				flexGrow: 0,
				flexShrink: 1,
				width: "100%",
				maxWidth: `${ naturalWidth }px`
			} : undefined }
		>
			<Legend size={ size } orientation={ orientation } { ...rest }
				actions={ props.actions || [] }/>
		</div>
	)
}