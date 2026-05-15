import React from "react"

import { scaleLinear } from "d3-scale"

const identity = d => d;

const SizeMap = {
	medium: [250, 30, "text-xs"],
	large: [400, 40, "text-sm"]
}

const VerticalCategoricalLegendItem = ({ label, color }) => {
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
		<div className="px-4 grid grid-cols-1 gap-1">
			{ categoriesAndColors.map(([cat, color]) =>
					<VerticalCategoricalLegendItem key={ cat }
						label={ cat }
						color={ color }/>
				)
		}
		</div>
	)
}

const VerticalLinearLegendTick = ({ value, format, width }) => {
	return (
		<>
			<div className="border-t-1 border-b-1 border-current pointer-events-none"
				style={ {
					transform: "translate(-50%, -1px)",
					width: `${ width }px`
				} }/>
			<div className="pr-2"
				style={ {
					transform: "translate(2px, 0)",
				} }
			>
				{ format(value) }
			</div>
		</>
	)
}

const VerticalLinearLegend = ({ size, scale = scaleLinear(), format = identity }) => {

	const [height, width] = React.useMemo(() => {
		return SizeMap[size];
	}, [size]);

	const ticks = React.useMemo(() => {
		const domain = scale.domain();
		const min = domain.at(0);
		const max = domain.at(-1);
		const diff = max - min;
		const p0 = min;
		const p25 = diff * 0.25 + min;
		const p50 = diff * 0.50 + min;
		const p75 = diff * 0.75 + min;
		const p100 = max;
		return [p0, p25, p50, p75, p100]
	}, [scale, height]);

	return (
		<div className="relative w-fit flex"
			style={ {
				height: `${ height }px`
			} }
		>
			<div
				className="rounded"
				style={ {
					background: `linear-gradient(to bottom, ${ scale.range() })`,
					width: `${ width * 0.5 }px`,
					height: `${ height }px`
				} }/>

			<div className="grid grid-cols-1">
				{ ticks.slice(0, -1).map((t, i) =>
						<div key={ t }
							style={ {
								height: `${ height * 0.25 }px`
							} }
						>
							<VerticalLinearLegendTick key={ t }
								value={ t }
								format={ format }
								width={ width }/>
						</div>
					)
				}
				<VerticalLinearLegendTick
					value={ ticks.at(-1) }
					format={ format }
					width={ width }/>
			</div>
		</div>
	)
}

const HorizontalLinearLegendTick = ({ scale, value, format, below, height }) => {
	return below ? (
		<>
			<div className="absolute border-l-1 border-r-1 border-current pointer-events-none"
				style={ {
					transform: `translate(${ scale(value) - 1 }px, -50%)`,
					height: `${ height }px`
				} }/>
			<div className="absolute bottom-0"
				style={ {
					transform: `translate(${ scale(value) + 4 }px, 0%)`
				} }
			>
				{ format(value) }
			</div>
		</>
	) : (
		<>
			<div className="absolute border-l-1 border-r-1 border-current pointer-events-none"
				style={ {
					transform: `translate(${ scale(value) - 1 }px, -100%)`,
					height: `${ height }px`
				} }/>
			<div className="absolute"
				style={ {
					transform: `translate(${ scale(value) + 4 }px, -200%)`
				} }
			>
				{ format(value) }
			</div>
		</>
	)
}

const HorizontalLinearLegend = ({ size, scale = scaleLinear(), format = identity }) => {

	const [width, height] = React.useMemo(() => {
		return SizeMap[size];
	}, [size]);

	const [wScale, ...ticks] = React.useMemo(() => {
		const domain = scale.domain();
		const min = domain.at(0);
		const max = domain.at(-1);
		const diff = max - min;
		const p0 = min;
		const p25 = diff * 0.25 + min;
		const p50 = diff * 0.50 + min;
		const p75 = diff * 0.75 + min;
		const p100 = max;
		const wScale = scaleLinear().domain([min, max]).range([0, width]);
		return [wScale, p0, p25, p50, p75, p100]
	}, [scale, width]);

	return (
		<div className="relative"
			style={ {
				width: `${ width }px`,
				height: `${ height }px`
			} }
		>
			<div
				className="rounded"
				style={ {
					background: `linear-gradient(to right, ${ scale.range() })`,
					width: `${ width }px`,
					height: `${ height * 0.5 }px`
				} }/>
			{ ticks.map((t, i) =>
					<HorizontalLinearLegendTick key={ t }
						below={ i % 2 === 0}
						scale={ wScale }
						value={ t }
						format={ format }
						height={ height }/>
				)
			}
		</div>
	)
}

const getLegend = (type, orientation) =>
	type === "categorical" ? VerticalCategoricalLegend :
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

	return (
		<div className={ textSize }>
			<Legend size={ size } { ...rest }/>
		</div>
	)
}