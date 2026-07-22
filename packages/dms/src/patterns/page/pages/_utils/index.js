import { v4 as uuidv4 } from 'uuid';
import { isEqual, reduce, map, cloneDeep} from "lodash-es"
import { matchRoutes } from 'react-router'
import {
    dataItemsNav as dataItemsNavCore,
    getChildNav as getChildNavCore
} from '../../../../utils/nav'
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

// Nav shaping lives in utils/nav (shared with other patterns); the page
// pattern binds its section-aware in-page rail (getInPageNav) as the
// child-resolver so page nav keeps its in-page anchor children.
const inPageMenuItems = (item) => getInPageNav(item)?.menuItems || [];

export const getChildNav = (item, dataItems, baseUrl = '', edit) =>
    getChildNavCore(item, dataItems, baseUrl, edit, inPageMenuItems);

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

export const dataItemsNav = (dataItems, baseUrl = '', edit = false) =>
    dataItemsNavCore(dataItems, baseUrl, edit, inPageMenuItems);

export function nav2Level(items, level = 1, path, baseUrl = '', navTitle = '') {
  let output = null
  if (level > 1) {
    let relativePath = path.endsWith('/edit') ? path.replace('/edit', '') : path.replace('/edit/', '/')
    if (baseUrl && relativePath.startsWith(baseUrl)) {
      relativePath = relativePath.slice(baseUrl.length)
    }
    let levelPath = baseUrl + '/' + relativePath.split('/').filter(d => d).filter((d, i) => i < level - 1).join('/')
    let matchItems = items.map(d => ({
      ...d, path: d?.path?.endsWith('/edit') ? d?.path?.replace('/edit', '') : d?.path?.replace('/edit/', '/')
    }))
    let matches = matchRoutes(matchItems, { pathname: levelPath })
    output = matches?.[0]?.route?.subMenus || []
    if (navTitle && matches?.[0]?.route?.name) {
      output = [{ name: matches?.[0]?.route?.name, className: navTitle }, ...output]
    }
  }
  return output || items
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
  const baseSlug = `${getParentSlug(item, dataItems)}${toSnakeCase(item.title)}`

  if (item.url_slug && item.url_slug === baseSlug) {
    return baseSlug
  }

  // Exclude the item's own existing row (if any) so renaming back to an
  // unchanged slug never collides with itself.
  const existingSlugs = new Set(dataItems.filter(d => d.id !== item.id).map(d => d.url_slug))
  if (!existingSlugs.has(baseSlug)) {
    return baseSlug
  }

  // `_${item.index}` was previously returned unconditionally as "the" disambiguated
  // slug, without checking it was actually unique — two pages created before
  // `dataItems` had refreshed (so both computed the same `highestIndex`/index) would
  // silently write duplicate url_slugs. Keep looping until the candidate is unique.
  let slug = `${baseSlug}_${item.index}`
  let n = 2
  while (existingSlugs.has(slug)) {
    slug = `${baseSlug}_${item.index}_${n}`
    n++
  }
  return slug
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
export const sectionsEditBackill = (item, baseUrl, apiUpdate, search, theme) => {
    if(!item.draft_section_groups && item?.id) {
            // Default section-group style comes from the pages theme (sane simple
            // setting), so a brand owns the default scaffold. Falls back to 'content'.
            const defaultStyle = theme?.pages?.sectionGroup?.defaultStyle || 'content'
            let newItem = {id: item.id}
            newItem.draft_section_groups = [
                {name: 'default', position: 'content', index: 0, theme: defaultStyle},
                // Every page gets a `sidebar` group so the in-page-nav rail always has an
                // author-reachable content area. position:'sidebar' keeps it out of the
                // top/content/bottom band renders (and out of the section-groups pane).
                {name: 'sidebar', position: 'sidebar', index: 99, theme: defaultStyle},
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

// Slug used as a section's DOM anchor id. Shared by getInPageNav (the rail link
// target) and section.jsx (the id it emits) so the two always agree — this is a
// correctness coupling, not a brevity helper.
export const slugifyAnchor = (str = '') =>
    String(str).toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

export function getInPageNav(item, theme, edit) {
    // In edit mode the rail must preview the in-progress draft; in view it reads
    // the published sections. (Phase 6 — was hardcoded to item.sections.)
    const sections = edit ? item?.draft_sections : item?.sections

    //console.log('test 123', theme)

    const menuItems = (Array.isArray(sections) ? sections : []).reduce((acc, {title, element, level: levelFromProp, navLabel, anchorId, ...props}) => {
        if(!element) return acc;

        // ── NEW: explicit opt-in via `navLabel` ──
        // Decoupled from title/level/element-type, so empty-title `h2`-headed
        // sections (e.g. the MAP-21 §-headers) can participate in the rail.
        if(navLabel) {
            const id = anchorId || slugifyAnchor(navLabel);
            acc.push({
                name: navLabel,
                anchorId: id,
                onClick: () => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' }),
            });
            return acc;
        }

        const level = Array.isArray(levelFromProp) ? levelFromProp[0] : levelFromProp;
        const isLexical = element['element-type'] === 'lexical' || !element['element-type'];
        const isCard = element['element-type'] === 'Card';
        const isH1 = level === '1';

        if(!isLexical && !isCard) return acc;
        if(!isH1) return acc;
        // if (((!title || !isH1) && !isLexical) || !isH1) return acc; // filtering for level 1 section header

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

// Re-export from central location for backward compatibility
export { updateRegisteredFormats, updateAttributes, initializePatternFormat } from '../../../../dms-manager/_utils';

export const parseIfJSON = (text, fallback={}) => {
    try {
        if(text && typeof text === 'object') return text;
        if(typeof text !== 'string' || !text) return fallback;
        return JSON.parse(text)
    }catch (e){
        return fallback;
    }
}

export const mergeFilters = (pageFilters=[], patternFilters=[]) => {
    // patternFilters should take over if present

    const pageFiltersFormatted = parseIfJSON(pageFilters, pageFilters || []);
    if(pageFiltersFormatted === 'no-access') return [];
    // console.log('??', pageFiltersFormatted)
    // make sure page filters work both in edit and view mode when url is used
    // test what happens if two users are on the same page and one changes the filter
    const patternFiltersFormatted = (patternFilters || []);
    const pageOnlyFilters = pageFiltersFormatted.filter(f => !patternFiltersFormatted.some(patternF => patternF.searchKey === f.searchKey));
    return [...patternFiltersFormatted, ...pageOnlyFilters]
}

// ── Auto-registered page variables from a map's "share state" (?layers= / f_<symId>) ──
// A map section with display.shareableState owns URL params for which symbologies are
// visible (`layers`, held as ONE comma-joined value so the existing `?layers=a,b` URL
// shape is preserved — the map splits it) and each symbology's selected interactive-filter
// index (`f_<symId>`). The map used to write these to the URL itself (useSearchParams),
// which fought the page's URL ownership and — under React Compiler — looped. We instead
// AUTO-REGISTER them as page variables so the page owns the URL and the map reads/writes
// them through pageState like every other component. `values` are managed by the map; the
// page-variable system just round-trips searchKey ⇄ URL and surfaces them in the Settings tab.
export const deriveMapShareVariables = (item) => {
    // Read both published + draft sections so the auto-registered variables surface in
    // view mode (`sections`) AND the edit-mode Settings tab (`draft_sections`).
    const sections = [...(item?.sections || []), ...(item?.draft_sections || [])];
    const vars = [];
    const seen = new Set();
    let hasShareableMap = false;
    sections.forEach(section => {
        const el = section?.element || section?.data?.element || {};
        // element-type is registered as "Map" (capital); match case-insensitively.
        if (String(el['element-type'] || '').toLowerCase() !== 'map') return;
        const cfg = parseIfJSON(el['element-data'], {});
        if (!cfg?.display?.shareableState) return;
        hasShareableMap = true;
        // UNIFY: an interactive symbology shares its SELECTED variant through the
        // interactive layer's own `searchParamKey` page variable (the same binding a
        // county-template map uses to select a variant), NOT a separate `f_<symId>`
        // URL param. Register each interactive layer's `searchParamKey`. (A shareable
        // interactive symbology with no `searchParamKey` authored simply isn't shared.)
        Object.values(cfg.symbologies || {}).forEach(symb => {
            Object.values(symb?.symbology?.layers || {}).forEach(layer => {
                const hasInteractive = (layer['interactive-filters'] || []).length;
                const key = layer.searchParamKey;
                if (!hasInteractive || !key || seen.has(key)) return;
                seen.add(key);
                vars.push({ id: `map_share_${key}`, searchKey: key, values: [],
                            useSearchParams: true, type: 'map_share', auto: true });
            });
        });
    });
    if (hasShareableMap) {
        // `layers` is registered once even if a page has >1 shareable map. Dedup by
        // searchKey (above + here) prevents duplicate registry entries, but it also
        // means multiple shareable maps on ONE page would SHARE the `layers` var (and
        // any colliding `searchParamKey`s) and fight over it. Multi-shareable-map per
        // page is unsupported for now; namespacing per map (e.g. `layers`/`layers_2`)
        // is a future enhancement. Single shareable map per page is the intended use.
        vars.unshift({ id: 'map_share_layers', searchKey: 'layers', values: [],
                       useSearchParams: true, type: 'map_share', auto: true });
    }
    return vars;
};

// The full page-variable registry: authored page.filters (+ pattern filters) plus any
// component-auto-registered variables (currently map share-state). Deduped by searchKey so
// an author-declared entry always wins over an auto one. Used by BOTH the pageState seed
// (view.jsx) AND the URL→pageState sync (below) so the two sides agree on what's registered.
export const getPageVariableRegistry = (item, patternFilters=[]) => {
    const authored = mergeFilters(item?.filters, patternFilters);
    const authoredKeys = new Set(authored.map(f => f.searchKey));
    const derived = deriveMapShareVariables(item).filter(v => !authoredKeys.has(v.searchKey));
    return [...authored, ...derived];
}


export const updatePageStateFiltersOnSearchParamChange = ({searchParams, item, patternFilters, setPageState}) => {
    // Extract filters from the URL
    const urlFilters = Array.from(searchParams.keys()).reduce((acc, searchKey) => {
        acc[searchKey] = searchParams.get(searchKey)?.split('|||');
        return acc;
    }, {});

    // If searchParams have changed, they should take priority and update the state
    //if (Object.keys(urlFilters).length ) { // || true // was eslint issue
        const existingFilters = getPageVariableRegistry(item, patternFilters);
        const newFilters = (existingFilters || []).map(filter => {
            if(filter.useSearchParams && urlFilters[filter.searchKey]){
                return {...filter, values: urlFilters[filter.searchKey]}
            }else{
                return filter;
            }
        })

        if(newFilters?.length){
            setPageState(page => {
                // updates from searchParams are temporary.
                // Idempotency guard: only write when the filters actually changed.
                // An unconditional `page.filters = newFilters` makes a brand-new array
                // (and thus a new pageState) on every fire of the searchParams effect;
                // under React Compiler that feeds an infinite re-render loop (sections
                // re-read the new `filters` identity → re-render → cascade). No-op when
                // unchanged so immer returns the same state and React bails out.
                if (!isEqual(page.filters, newFilters)) {
                    page.filters = newFilters
                }
            })
        }
    //}
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

export const getPageAuthPermissions = authPermissions =>
    authPermissions && typeof authPermissions === 'string' ? JSON.parse(authPermissions) :
    authPermissions && typeof authPermissions === 'object' ? authPermissions : undefined;
