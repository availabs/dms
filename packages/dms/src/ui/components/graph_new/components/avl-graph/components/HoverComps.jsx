import React from "react"

import get from "lodash/get"

import { Identity } from "../utils"

const EmptyObject = {};

/**
 * Tooltip bodies shared by more than one avl-graph wrapper.
 *
 * Each wrapper used to carry its own `DefaultHoverComp`. Sunburst's and Treemap's were
 * byte-identical copies of each other — the same 48 lines, down to the same commented-out
 * `makeLabel` sketch and the same tab indentation — so they live here once instead of twice.
 *
 * A wrapper keeps its own comp when its tooltip is genuinely a different shape: LineGraph's
 * carries a `(Line Total)` column, three-column rows and a second pass over `data.secondary`,
 * and folding that in would mean a variant flag on every row.
 *
 * `packages/dms/tests/hoverCompLegacyMarkup.test.js` pins the rendered HTML of all six against
 * goldens captured before this file existed.
 */

// Hierarchy tooltip: a breadcrumb label built by walking the hovered node up to the root, then
// the node's own value. Used by SunburstGraph and TreemapGraph, whose data are both d3
// hierarchies — depth 1 is the index, depth 2 the category.
export const LabelValueHoverComp = ({ data: node, indexFormat, keyFormat, valueFormat, classNames }) => {

	const cn = classNames || EmptyObject;

	const label = React.useMemo(() => {



		// const makeLabel = (node, label = "") => {
		// 	if (node.parent) {
		// 		return makeLabel(node.parent, `${ format(node.data[0]) } ${ label }`);
		// 	}
		// 	return isRoot ? "Total" : label;
		// }

		const makeLabel = (node, label = "") => {
			if (!node) {
				return label || "total";
			}
			const d = node.data[0];
			if (d === null || d === undefined) {
				return makeLabel(node.parent, label);
			}

			const isIndex = node.depth == 1;
			const isCat = node.depth === 2;

			const format = isIndex ? indexFormat :
											isCat ? keyFormat :
											Identity;

			return makeLabel(node.parent, `${ format(d) } ${ label }`);
		}

		return makeLabel(node);
	}, [node, indexFormat, keyFormat]);

  return (
    <div className={ `
      flex flex-col px-2 pt-1 rounded min-w-40
    ` }>
    	<div className={ `${ cn.title || "font-bold text-lg leading-6 border-b-2" }` }>
    		{ label }
    	</div>
    	<div className={ `${ cn.value || "text-right" }` }>
    		{ valueFormat(node.value) }
    	</div>
    </div>
  )
}
// Series-rows tooltip: a title, one row per series (swatch · label · value), and an optional
// total. Used by BarGraph and PieGraph, whose bodies were identical apart from three things —
// all three are now call-site props:
//
//   orderedKeys  Bar reverses the key array; Pie sorts by value descending. On ordinary data
//                the two orderings agree, which is why the goldens carry a case built to
//                disagree (`bar: row order is key-reversed` / `pie: row order is value-…`).
//   colorForKey  Bar reads `data.barValues[key].color`, Pie `data.colorMap[index][key]`.
//   showTotals   Bar defaults it true, Pie leaves it undefined — so an omitted prop means no
//                total row on a pie. Preserved by NOT defaulting it here; each wrapper passes
//                the value its own DefaultHoverCompData resolved.
//
// GridGraph deliberately keeps its own body: its rows carry two stacked swatches (an opaque
// underlay behind a translucent cell colour), an inline `outline` highlight, a grid wrapper and
// a bordered total — six structural differences, which is past the point where a shared
// component with a flag per difference is worth having.
//
// Token contract, same as the legend's: a token replaces the LOOK it names and never the
// STRUCTURE around it. `w-5 h-5`, `flex-1`, `items-center` and `color-square` are emitted
// outside the tokens — `color-square` in particular is not decoration but an ancestor-dependent
// hook (`.hover-comp .color-square` in avl-graph.css), so a theme must not be able to drop it.
export const SeriesRowsHoverComp = ({
  data, keys, indexFormat, keyFormat, valueFormat, valueLabel, showTotals,
  orderedKeys, colorForKey, classNames
}) => {
  const cn = classNames || EmptyObject;
  return (
    <div className={ `
      flex flex-col px-2 pt-1 rounded
      ${ keys.length <= 1 ? "pb-2" : "pb-1" }
    ` }>
      <div className={ `${ cn.title || "font-bold text-lg leading-6 border-b-2" } mb-1 pl-2` }>
        { indexFormat(get(data, "index", null)) }
      </div>
      { orderedKeys(keys, data).map(key => (
            <div key={ key } className={ `
              flex items-center px-2 border-2 rounded transition ${ cn.row || "" }
              ${ data.key === key ? (cn.rowActive || "border-current") : "border-transparent" }
            `}>
              <div className={ `mr-2 ${ cn.swatch || "rounded-sm" } color-square w-5 h-5` }
                style={ {
                  backgroundColor: colorForKey(data, key),
                  opacity: data.key === key ? 1 : 0.2
                } }/>
              <div className="mr-4">
                { keyFormat(key) }:
              </div>
              <div className={ `${ cn.value || "text-right" } flex-1` }>
                { valueFormat(get(data, ["data", key], 0)) }
                { !valueLabel ? null :
                  <b className="ml-1">{ valueLabel }</b>
                }
              </div>
            </div>
          ))
      }
      { (keys.length <= 1) || !showTotals ? null :
        <div className="flex pr-2">
          <div className="w-5 mr-2"/>
          <div className="mr-4 pl-2">
            Total:
          </div>
          <div className={ `flex-1 ${ cn.value || "text-right" }` }>
            {  valueFormat(keys.reduce((a, c) => a + get(data, ["data", c], 0), 0)) }
          </div>
        </div>
      }
    </div>
  )
}
