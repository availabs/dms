// const baseUrl = ''

function getChildNav(item, dataItems, baseUrl='', edit) {
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

export function getCurrentDataItem(dataItems, baseUrl) {
    const location =
        window.location.pathname
            .replace(baseUrl, '')
            .replace('/', '')
            .replace('edit/', '');

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

export function dataItemsNav(dataItems, baseUrl = '', edit = false) {
    // console.log('dataItemsnav', dataItems)
    return dataItems
        .sort((a, b) => a.index - b.index)
        .filter(d => !d.parent)
        .filter(d => (edit || d.published !== 'draft' ))
        .map((d, i) => {
            //console.log(d)
            let item = {
                id: d.id,
                path: `${edit ? `${baseUrl}/edit` : baseUrl}/${/*i === 0 && !edit ? '' : */d.url_slug || d.id}`,
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
