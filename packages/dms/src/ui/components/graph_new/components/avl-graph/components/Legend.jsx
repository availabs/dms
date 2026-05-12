import React from "react"

import { scaleLinear } from "d3-scale"

const VerticalLegendItem = ({ label, color }) => {
	return (
		<div className="flex items-center">
			<div className="w-4 h-4 rounded mr-1"
				style={ { backgroundColor: color } }/>
			<div>{ label }</div>
		</div>
	)
}

const VerticalCategoricalLegend = ({ categories = [], colors = [] }) => {
	const categoriesAndColors = React.useMemo(() => {
		const l = colors.length;
		return categories.map((cat, i) => {
			return [cat, colors[i % l]];
		}).reverse();
	}, [categories, colors]);
	return (
		<div className="px-4">
			{ categoriesAndColors.map(([cat, color]) =>
					<VerticalLegendItem key={ cat }
						label={ cat }
						color={ color }/>
				)
		}
		</div>
	)
}

const VerticalLinearLegend = ({ scale }) => {

}

const IDENTITY = d => d;

const HorizontalLinearLegend = ({ scale, format = IDENTITY }) => {

	const domain = scale.domain();
	const range = scale.range();

	const min = domain.at(0);
	const max = domain.at(-1);
	const diff = max - min;
	const p10 = diff * 0.10 + min;
	const p50 = diff * 0.50 + min;
	const p90 = diff * 0.90 + min;

	const wScale = scaleLinear().domain([min, max]).range([0, 200])

	return (
		<div className="w-[200px] h-8 relative">
			<div className="w-[200px] h-4 rounded relative overflow-visible"
				style={ {
					background: `linear-gradient(to right, ${ range })`
				} }
			>
			</div>
			<div className="absolute h-8 border-l-1 border-r-1"
				style={ {
					top: "-50%",
					left: `${ wScale(p10) - 1 }px`
				} }/>
			<div className="absolute text-xs"
				style={ {
					transform: `translate(${ wScale(p10) + 1 }px, -200%)`
				} }
			>
				{ format(p10) }
			</div>

			<div className="absolute top-0 h-8 border-l-1 border-r-1"
				style={ {
					left: `${ wScale(p50) - 1 }px`
				} }/>
			<div className="absolute bottom-0 text-xs"
				style={ {
					transform: `translate(${ wScale(p50) + 1 }px, 0%)`
				} }
			>
				{ format(p50) }
			</div>

			<div className="absolute h-8 border-l-1 border-r-1"
				style={ {
					top: "-50%",
					left: `${ wScale(p90) - 1 }px`
				} }/>
			<div className="absolute text-xs"
				style={ {
					transform: `translate(${ wScale(p90) + 1 }px, -200%)`
				} }
			>
				{ format(p90) }
			</div>
		</div>
	)
}

const getLegend = (type, orientation) =>
	type === "categorical" ? VerticalCategoricalLegend :
		orientation === "vertical" ? VerticalLinearLegend :
																	HorizontalLinearLegend;

export const Legend = props => {
	const { type, orientation = "horizontal", ...rest } = props

	const Legend = React.useMemo(() => {
		return getLegend(type, orientation);
	}, [type, orientation]);

	return (
		<div className="text-sm">
			<Legend { ...rest }/>
		</div>
	)
}