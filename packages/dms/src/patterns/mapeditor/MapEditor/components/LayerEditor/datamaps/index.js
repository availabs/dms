import { rgb2hex, toHex, categoricalColors } from '../../LayerManager/utils'
import ckmeans, {equalIntervalBreaks, jenksBreaks, prettyBreaks} from '../../../../ckmeans'
import { get } from 'lodash-es'

export function categoryPaint(column, categoryData, colors, num=10, metadata) {

  //console.log('categoryPaint', column, metadata)
  
  let columnMetadata = JSON.parse((metadata.filter(d => d.name === column)?.[0] || {})?.meta_lookup || "{}")
  
  // to allow for calculated columns
  const column_ref = (column || '').includes('AS ') ? column.split('AS ')[1] : column 
  let paint = ['match',
      ['to-string',['get', column_ref]],
  ]
  
  Array.from(Array(+num).keys()).forEach((d,i) => {
    let cat = ''+categoryData?.[i]?.[column]
      if(cat && cat != '[object Object]'){
        paint.push(''+categoryData?.[i]?.[column])
        paint.push(toHex(colors[i % colors.length]))
      }
  })

  const legend  = (paint || []).filter((d,i) => i > 2 )
      .map((d,i) => {
        if(i%2 === 0) {
          return {color: d, label: get(columnMetadata, paint[i+2],paint[i+2]) }
        }
        return null
      })
      .filter(d => d)

  return {paint, legend}
}

export function isValidCategoryPaint(paint) {
  let valid = typeof paint === 'object' && Array.isArray(paint)
  if(!valid) {
    return valid
  }
  paint.forEach(cat => {
    if(!cat || cat === 'undefined') {
      valid = false
    }
  }) 
  return valid
}

let methods = {
  'ckmeans': ckmeans,
  'equalInterval': equalIntervalBreaks, 
  'jenks': ckmeans,//jenksBreaks, 
  'pretty': prettyBreaks
}

let round = (n, p = 2) => (e => Math.round(n * e) / e)(Math.pow(10, p))

export function choroplethPaint( column, max, colors, num=10, method='ckmeans',colorBreaks, showOther, legendOrientation="vertical"  ) {
  //console.log('paint method', method)
  let paint = [
    'step',
    ["to-number", ['get', column]],
  ];

  let domain = colorBreaks;

  if(!Array.isArray(domain) || domain.length  === 0){
    return false
  }

  paint.push(colors[0]);

  domain.forEach((d,i) => {
    paint.push(+d)
    paint.push(colors[i]);
  })

  //paint.push(colors[num-1])

  const legend = [
    ...(paint || [])
      .filter((d, i) => i > 2)
      .map((d, i) => {
        if (i % 2 === 1) {
          //console.log('test', fnumIndex(paint[i+4] || max))
          let label = '';

          if(legendOrientation === "vertical") {
            label = `${
              paint[i + 2] > 1000 ? fnumIndex(paint[i + 2]) : paint[i + 2]
            } - ${
              paint[i + 2] > 1000 || paint[i + 4] > 1000
                ? fnumIndex(paint[i + 4] || max)
                : paint[i + 4] || max
            }`;
          } else if (legendOrientation === "horizontal") {
            label = `${paint[i + 2] > 1000 ? fnumIndex(paint[i + 2]) : paint[i + 2]}`;
          }

          return {
            color: paint[i + 3],
            label,
          };
        }
        return null;
      })
      .filter((d) => d),
  ];
  return { paint:["case", ["==", ['get', column], null], showOther, paint] , legend }
}

export const fnumIndex = (d, fractions = 2, currency = false) => {
    if (d >= 1000000000000) {
      return `${currency ? '$' : ``}${(d / 1000000000000).toFixed(fractions)}T`;
    } else if (d >= 1000000000) {
      return `${currency ? '$' : ``}${(d / 1000000000).toFixed(fractions)}B`;
    } else if (d >= 1000000) {
      return `${currency ? '$' : ``}${(d / 1000000).toFixed(fractions)}M`;
    } else if (d >= 1000) {
      return `${currency ? '$' : ``}${(d / 1000).toFixed(fractions)}K`;
    } else {
      return typeof d === "object" ? `` :`${currency ? '$' : ``}${parseInt(d)}`;
    }
  }