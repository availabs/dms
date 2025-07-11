import { v4 as uuidv4 } from 'uuid';
import { isEqual, reduce, map, cloneDeep} from "lodash-es"
export const convertToUrlParams = (obj, delimiter='|||') => {
    const params = new URLSearchParams();

    Object.keys(obj).forEach(column => {
        const values = obj[column];
        if(!values || !Array.isArray(values) || !values?.length) return;
        params.append(column, values.filter(v => Array.isArray(v) ? v.length : v).join(delimiter));
    });

    return params.toString();
};

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

export function getChildNav(item, dataItems, baseUrl='', edit) {
    let children = dataItems
        .filter(d => item.id && d.parent === item.id)
        .sort((a, b) => a.index - b.index)

    let inPageChildren =  getInPageNav(item)?.menuItems || [];
    if (children.length === 0 && inPageChildren?.length === 0) return false
    if (children.length === 0 && inPageChildren?.length !== 0) return inPageChildren;

    const childrenToReturn = children
        .filter(d => !d?.hide_in_nav)
        .map((d, i) => {
        let item = {
            id: d.id,
            path: `${edit ? `${baseUrl}/edit` : baseUrl}/${d.url_slug || d.id}`,
            name: d.title,
            description: d.description,
            hideInNav: d.hide_in_nav
        }
        if(d?.icon && d?.icon !== 'none') {
                item.icon = d.icon
        }
        const inPageChildrenForD =  getInPageNav(d)?.menuItems || [];
        const childrenForD = getChildNav(d, dataItems, baseUrl, edit) || [];
        item.subMenus = childrenForD.filter(d => d.name)

        return item
    })

    return childrenToReturn?.length ? childrenToReturn : inPageChildren;
}

export function getCurrentDataItem(dataItems, baseUrl) {
    const location =''
        // window ? window.location.pathname
        //     .replace(baseUrl, '')
        //     .replace('/', '')
        //     .replace('edit/', '') : '';

    return location === '' ?
        dataItems.find(d => d.index === 0 && d.parent === '') :
        dataItems.find((d, i) => d.url_slug === location || d.id === location);
}

export function detectNavLevel(dataItems, baseUrl) {
    const isMatch = getCurrentDataItem(dataItems, baseUrl)
    const isParent = dataItems.filter(d => d.parent === isMatch?.id).length;
    const level = isMatch ? isMatch.url_slug?.split('/')?.length : 1;
    return level + (isParent ? 1 : 0);
}

export function dataItemsNav(dataItems, baseUrl = '', edit = false, level=1) {
    // console.log('dataItemsnav', dataItems)
    return dataItems
        .sort((a, b) => a.index - b.index)
        .filter(d => !d.parent)
        .filter(d => (edit || d.published !== 'draft' ))
        .map((d, i) => {
            const url = `${d.url_slug || d.path || d.id}`;
            let item = {
                id: d.id,
                path: `${edit ? `${baseUrl}/edit` : baseUrl}${url?.startsWith('/') ? `` : `/`}${url}`,
                name: `${d.title || d.name} ${d.published === 'draft' ? '*' : ''}`,
                description: d.description,
                hideInNav: d.hide_in_nav
            }
            if(d?.icon && d?.icon !== 'none') {
                item.icon = d.icon
            }

            if (getChildNav(item, dataItems, baseUrl, edit)) {
                item.subMenus = getChildNav(d, dataItems, baseUrl, edit).filter(d => d.name)
            }

            return item
        })
    //return dataItems
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

function toTitleCase(str='') {
  return str.replace(
    /\w\S*/g,
    text => text.charAt(0).toUpperCase() + text.substring(1).toLowerCase()
  );
}
export const sectionsEditBackill = (item, baseUrl, apiUpdate, search) => {
    if(!item.draft_section_groups && item?.id) {
            let newItem = {id: item.id}
            newItem.draft_section_groups = [
                {name: 'default', position: 'content', index: 0, theme: 'content'}
            ]
            if(item?.header && item?.header !== 'none' ) {
                newItem.draft_section_groups.push( 
                    {name: 'header', position: 'top', index: 0, theme: 'header', full_width: 'show'}
                )
            }
            newItem.draft_sections = cloneDeep(item.draft_sections || [])

            if(item?.footer && item?.footer !== 'none' ) {
          newItem.draft_section_groups.push( 
            {name: 'footer', position: 'bottom', index: 99, theme: 'clearCentered', full_width: 'show'}
          )
          if(!item.draft_sections.filter(d => d.is_footer)?.[0]){
            newItem.draft_sections.push({
                "size": "2",
                "group": "footer",
                is_footer: true,
                "order": 0,
                "element": {
                    "element-type": "Footer: MNY Footer"
                },
                "trackingId": uuidv4(),
            })
          }
        }


            newItem.draft_sections.forEach((section,i) => {
                if(section.is_header) {
                    section.group = 'header'
                    section.padding = 'p-0'
                }
            })
            apiUpdate({data:newItem, newPath:`${baseUrl}/edit/${item.url_slug}${search}` })
        }
}

export const sectionsBackill = (item, baseUrl, apiUpdate) => {
     if(!item.section_groups && item.id) {
        //console.log('edit item', item)
        let newItem = {id: item.id}
        newItem.section_groups = [
          {name: 'default', position: 'content', index: 0, theme: 'content'}
        ]

        newItem.sections = cloneDeep(item?.sections || [])

        if(item?.header && item?.header !== 'none' ) {
          newItem.section_groups.push( 
            {name: 'header', position: 'top', index: 0, theme: 'header', full_width: 'show'}
          )
        }
        if(item?.footer && item?.footer !== 'none' ) {
          newItem.section_groups.push( 
            {name: 'footer', position: 'bottom', index: 99, theme: 'clearCentered', full_width: 'show'}
          )
          if(!item.sections.filter(d => d.is_footers)?.[0]){
            newItem.sections.push({
                "size": "2",
                "group": "footer",
                is_footer: 'true',
                "order": 0,
                "element": {
                    "element-type": "Footer: MNY Footer"
                },
                "trackingId": uuidv4(),
            })
          }
        }
        
        newItem.sections?.forEach((section,i) => {
          if(section.is_header) {
            section.group = 'header'
          }
        })
        //submit(json2DmsForm(newItem), { method: "post", action: `${baseUrl}/${item.url_slug}` })
        apiUpdate({data:newItem, newPath:`${baseUrl}/${item.url_slug}` })
      }
}

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
   
    const menuItems = (Array.isArray(currentDI?.sections) ? currentDI.sections : []).reduce((acc, {title, element, level, ...props}) => {
        if(!element) return acc;

        const isLexical = element['element-type'] === 'lexical' || !element['element-type'];
        if (((!title || level !== '1') && !isLexical) || level !== '1') return acc; // filtering for level 1 section header

        const lexicalNavElements =
            isLexical ? parseData(element['element-data'])?.root?.children?.reduce((acc, {type, tag, children, ...rest}) => {
                // filtering for H1 in lexical
                const heading = type === 'heading' && tag === 'h1' && children[0]?.text?.length ?
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
                            // className: `pl-2 pr-4 pb-1 text-sm text-slate-400 hover:text-slate-700 cursor-pointer border-r-2 mr-4
                            // ${
                            //     [...window.document.querySelectorAll(tag)]
                            //         .find(headerElement => headerElement?.children[0]?.innerHTML === children[0]?.text)?.offsetParent
                            //     === null ? 'text-blue-200' : ''
                            // }`
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
                // className: theme?.levelClasses?.[level]
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



export const parseJSON = (d, fallback={}) => {
     if(typeof d === 'object') {
        return d
    }
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

export const getNestedValue = (obj) => typeof obj?.value === 'object' ? getNestedValue(obj.value) : obj?.value || obj;

export const updateRegisteredFormats = (registerFormats, app, type) => {
  if(Array.isArray(registerFormats)){
    registerFormats = registerFormats.map(rFormat => {
      rFormat.app = app;
      rFormat.type = `${type}|${rFormat.type}`
      rFormat.registerFormats = updateRegisteredFormats(rFormat.registerFormats, app, type);
      rFormat.attributes = updateAttributes(rFormat.attributes, app, type);
      return rFormat;
    })
  }
  return registerFormats;
}

export const updateAttributes = (attributes, app, type) => {
  if(Array.isArray(attributes)){
    attributes = attributes.map(attr => {
      attr.format = attr.format ? `${app}+${type}|${attr.format.split('+')[1]}`: undefined;
      return updateRegisteredFormats(attr, app, type);
    })
    //console.log('attr', attributes)
  }
  return attributes;
}


export const parseIfJSON = (text, fallback={}) => {
    try {
        if(typeof text !== 'string' || !text) return fallback;
        return JSON.parse(text)
    }catch (e){
        return fallback;
    }
}

export const mergeFilters = (pageFilters=[], patternFilters=[]) => {
    // patternFilters should take over if present

    const pageFiltersFormatted = parseIfJSON(pageFilters, pageFilters || []);
    const patternFiltersFormatted = (patternFilters || []);
    const pageOnlyFilters = pageFiltersFormatted.filter(f => !patternFiltersFormatted.some(patternF => patternF.searchKey === f.searchKey));
    return [...patternFiltersFormatted, ...pageOnlyFilters]
}


export const updatePageStateFiltersOnSearchParamChange = ({searchParams, item, patternFilters, setPageState}) => {
    // Extract filters from the URL
    const urlFilters = Array.from(searchParams.keys()).reduce((acc, searchKey) => {
        const urlValues = searchParams.get(searchKey)?.split('|||');
        acc[searchKey] = urlValues;
        return acc;
    }, {});

    // If searchParams have changed, they should take priority and update the state

    if (Object.keys(urlFilters).length) {
        const existingFilters = mergeFilters(item.filters, patternFilters);
        const newFilters = (existingFilters || []).map(filter => {
            if(filter.useSearchParams && urlFilters[filter.searchKey]){
                return {...filter, values: urlFilters[filter.searchKey]}
            }else{
                return filter;
            }
        })

        if(newFilters?.length){
            setPageState(page => {
                // updates from searchParams are temporary
                page.filters = newFilters
            })
        }
    }
}

export const initNavigateUsingSearchParams = ({pageState, search, navigate, baseUrl, item, isView}) => {
    // one time redirection
    const searchParamFilters = (pageState?.filters || []).filter(f => f.useSearchParams);
    if(searchParamFilters?.length){
        const filtersObject = searchParamFilters
            .reduce((acc, curr) => ({...acc, [curr.searchKey]: typeof curr.values === 'string' ? [curr.values] : curr.values}), {});
        const url = `?${convertToUrlParams(filtersObject)}`;
        if(!search && url !== search){
            navigate(`${baseUrl}${isView ? `/` : `/edit/`}${item.url_slug}${url}`)
        }
    }
}
