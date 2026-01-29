//import {getCurrentDataItem} from "./navItems.js";
// const baseUrl = ''

export function timeAgo(input) {
  const date = (input instanceof Date) ? input : new Date(input);
  const formatter = new Intl.RelativeTimeFormat('en');
  const ranges = {
    years: 3600 * 24 * 365,
    months: 3600 * 24 * 30,
    weeks: 3600 * 24 * 7,
    days: 3600 * 24,
    hours: 3600,
    minutes: 60,
    seconds: 1
  };
  const secondsElapsed = (date.getTime() - Date.now()) / 1000;
  for (let key in ranges) {
    if (ranges[key] < Math.abs(secondsElapsed)) {
      const delta = secondsElapsed / ranges[key];
      return formatter.format(Math.round(delta), key);
    }
  }
}

export function getChildNav(item, dataItems=[], baseUrl='', edit) {
    let children = dataItems
        .filter(d => item.id && d.parent === item.id)
        .sort((a, b) => a.index - b.index)
    if (children.length === 0) return false

    return children.map((d, i) => {
        let item = {
            id: d.id,
            path: `${edit ? `${baseUrl}/edit` : baseUrl}/${d.url_slug || d.id}`,
            name: d.title
        }
        if (getChildNav(item, dataItems)) {
            item.subMenus = getChildNav(d, dataItems, baseUrl, edit)
        }
        return item
    })

}

export function getCurrentDataItem(dataItems=[], baseUrl) {
    const location =
        window.location.pathname
            .replace(baseUrl, '')
            .replace('/', '')
            .replace('edit/', '');

    return location === '' ?
        dataItems.find(d => d.index === 0 && d.parent === '') :
        dataItems.find((d, i) => d.url_slug === location || d.id === location);
}

export function detectNavLevel(dataItems=[], baseUrl) {
    const isMatch = getCurrentDataItem(dataItems, baseUrl)
    const isParent = dataItems.filter(d => d.parent === isMatch?.id).length;
    const level = isMatch ? isMatch.url_slug?.split('/')?.length : 1;
    return level + (isParent ? 1 : 0);
}

export function dataItemsNav(dataItems=[], baseUrl = '', edit = false) {
    // console.log('dataItemsnav', dataItems)
    return dataItems
        .sort((a, b) => a.index - b.index)
        .filter(d => !d.parent)
        .filter(d => (edit || d.published !== 'draft' ))
        .map((d, i) => {
            //console.log(d)
            let item = {
                id: d.id,
                path: `${edit ? `${baseUrl}/edit` : baseUrl}${d.url_slug  === '/' ? '' : '/'}${/*i === 0 && !edit ? '' : */d.url_slug || d.id}`,
                name: `${d.title} ${d.published === 'draft' ? '*' : ''}`,
                hideInNav: d.hide_in_nav
            }

            if (getChildNav(item, dataItems, baseUrl, edit)) {
                item.subMenus = getChildNav(d, dataItems, baseUrl, edit)
            }

            return item
        })
}

export const json2DmsForm = (data,requestType='update') => {
  let out = new FormData()
  out.append('data', JSON.stringify(data))
  out.append('requestType', requestType)
  //console.log(out)
  return out
}

const getParentSlug = (item, dataItems) => {
  

  if(!item.parent) {
    return ''
  }
  let parent = dataItems.filter(d => d.id === item.parent)[0]
  return `${parent.url_slug}/`
}

export const getUrlSlug = (item, dataItems) => {
  let slug =  `${getParentSlug(item, dataItems)}${toSnakeCase(item.title)}`

  if((item.url_slug && item.url_slug === slug) || !dataItems.map(d => d.url_slug).includes(slug)) {
    return slug
  }
  return `${slug}_${item.index}`
}

export const toSnakeCase = str =>
  str &&
  str
    .match(/[A-Z]{2,}(?=[A-Z][a-z]+[0-9]*|\b)|[A-Z]?[a-z]+[0-9]*|[A-Z]|[0-9]+/g)
    .map(x => x.toLowerCase())
    .join('_');



// const levelClasses = {
//     '1': ' pt-2 pb-1 uppercase text-sm text-blue-400 hover:underline cursor-pointer border-r-2 mr-4',
//     '2': 'pl-2 pt-2 pb-1 uppercase text-sm text-slate-400 hover:underline cursor-pointer border-r-2 mr-4',
//     '3': 'pl-4 pt-2 pb-1 text-sm text-slate-400 hover:underline cursor-pointer border-r-2 mr-4',
//     '4': 'pl-6 pt-2 pb-1 text-sm text-slate-400 hover:underline cursor-pointer border-r-2 mr-4',

// }

const parseData = data => !data ? {} : typeof data === "object" ? data : JSON.parse(data)?.text

export function getInPageNav(item, theme) {
    const currentDI = item

    //console.log('test 123', theme)
   
    const menuItems = (currentDI?.sections || []).reduce((acc, {title, element, level = '1', ...props}) => {

        if (!element || !title || level === '0' ) return acc;

        const lexicalNavElements =
            element['element-type'] === 'lexical' || !element['element-type'] ?
            parseData(element['element-data'])?.root?.children?.reduce((acc, {type, tag, children, ...rest}) => {

                const heading = type === 'heading' && children[0]?.text?.length ?
                    [
                        {
                            name: children[0]?.text,
                            onClick: (e) => {
                                const elmntToView =
                                    [...window.document.querySelectorAll(tag)]
                                        .find(headerElement => headerElement?.children[0]?.innerHTML === children[0]?.text);
                                // .__lexicalKey_cgviu
                                elmntToView?.scrollIntoView({ behavior: "smooth"});
                            },
                            className: `pl-2 pr-4 pb-1 text-sm text-slate-400 hover:text-slate-700 cursor-pointer border-r-2 mr-4
                            ${
                                [...window.document.querySelectorAll(tag)]
                                    .find(headerElement => headerElement?.children[0]?.innerHTML === children[0]?.text)?.offsetParent 
                                === null ? 'text-blue-200' : ''
                            }`
                        }
                    ] : []

                
                return [...acc, ...heading]
            }, []) : []

        return [
            ...acc,
            {
                name: title,
                onClick: (e) => {
                    const elmntToView = window.document.getElementById(`#${title?.replace(/ /g, '_')}`);
                    elmntToView?.scrollIntoView({ behavior: "smooth" });
                },
                className: theme?.levelClasses[level]
            },
            ...(lexicalNavElements || [])
        ]
    }, [])

    return {
        menuItems: menuItems,
        themeOptions: {
            size: 'full',
            color: 'transparent'
        }
    };
}

import { isEqual, map, reduce } from "lodash-es"


export const parseJSON = (d, fallback={}) => {
    let out = fallback
    try {
        out = JSON.parse(d)
    } catch (e) {
        //console.log('parse failed',d)
    }
    return out
}

/*
 * Compare two objects by reducing an array of keys in obj1, having the
 * keys in obj2 as the intial value of the result. Key points:
 *
 * - All keys of obj2 are initially in the result.
 *
 * - If the loop finds a key (from obj1, remember) not in obj2, it adds
 *   it to the result.
 *
 * - If the loop finds a key that are both in obj1 and obj2, it compares
 *   the value. If it's the same value, the key is removed from the result.
 */
export function getObjectDiff(obj1, obj2) {
    const diff = Object.keys(obj1).reduce((result, key) => {
        if (!Object.hasOwn(obj2,key)) { //
            result.push(key);
        } else if (isEqual(obj1[key], obj2[key])) {
            const resultKeyIndex = result.indexOf(key);
            result.splice(resultKeyIndex, 1);
        }
        return result;
    }, Object.keys(obj2));

    return diff;
}

export function compare (a, b) {

  var result = {
    different: [],
    missing_from_first: [],
    missing_from_second: []
  };

  reduce(a, function (result, value, key) {
    if (Object.hasOwn(b,key)) {
      if (isEqual(value, b[key])) {
        return result;
      } else {
        if (typeof (a[key]) != typeof ({}) || typeof (b[key]) != typeof ({})) {
          //dead end.
          result.different.push(key);
          return result;
        } else {
          var deeper = compare(a[key], b[key]);
          result.different = result.different.concat(map(deeper.different, (sub_path) => {
            return key + "." + sub_path;
          }));

          result.missing_from_second = result.missing_from_second.concat(map(deeper.missing_from_second, (sub_path) => {
            return key + "." + sub_path;
          }));

          result.missing_from_first = result.missing_from_first.concat(map(deeper.missing_from_first, (sub_path) => {
            return key + "." + sub_path;
          }));
          return result;
        }
      }
    } else {
      result.missing_from_second.push(key);
      return result;
    }
  }, result);

  reduce(b, function (result, value, key) {
    if (Object.hasOwn(a,key)) {
      return result;
    } else {
      result.missing_from_first.push(key);
      return result;
    }
  }, result);

  return result;
}