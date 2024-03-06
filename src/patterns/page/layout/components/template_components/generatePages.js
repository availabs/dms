//import { Promise } from "bluebird";
import { parseJSON } from '../utils/parseJSON'
import { RegisteredComponents } from '../../../selector'
import { dmsDataEditor } from '../../../../../index'
import cloneDeep from 'lodash/cloneDeep'



export const generatePages = async ({
    item, url, destination, id_column, dataRows, falcor, setLoadingStatus
}) => {
    // const disaster_numbers = ['4020', '4031']

    setLoadingStatus('Generating Pages...', dataRows)
    const idColAttr =
        dataRows
            .filter(d => !d?.state_fips || d.state_fips === '36')
            .sort((a,b) => a?.state_fips ? +b[id_column.name] - +a[id_column.name] : true)
            .map(d => d[id_column.name])
            //.filter((d,i) => (d && (i < 3)))

    let i = 0;
    console.log('generatePages', idColAttr, dataRows)
    //console.time('Pages generated in:')
    await PromiseMap(idColAttr, (async(idColAttrVal, pageI) => {
        // await acc;
        setLoadingStatus(`Generating page ${++i}/${idColAttr?.length}`)
        const dataControls = item.data_controls;
        let updates = await PromiseMap(item.sections.map(s => s.id), async section_id => {
            let section = item.sections.filter(d => d.id === section_id)?.[0]  || {}
            let data = parseJSON(section?.element?.['element-data']) || {}
            let type = section?.element?.['element-type'] || ''
            let comp = RegisteredComponents[type] || {}
            let controlVars = (comp?.variables || []).reduce((out,curr) => {
                out[curr.name] = data[curr.name]
                return out
            },{})

            let updateVars = Object.keys(dataControls?.sectionControls?.[section_id] || {}) // check for id_col
                .reduce((out,curr) => {
                    const attrName = dataControls?.sectionControls?.[section_id]?.[curr]?.name || dataControls?.sectionControls?.[section_id]?.[curr];

                    out[curr] = attrName === id_column.name ? idColAttrVal :
                        (
                            dataControls?.active_row?.[attrName] ||
                            dataControls?.active_row?.[attrName] ||
                            null
                        )
                    return out
                },{})

                let args = {...controlVars, ...updateVars}
                if(comp.name = 'Header: County'){
                    console.log('updateVars', args, comp)
                }
                return comp?.getData ? comp.getData(args,falcor).then(data => ({section_id, data})) : ({section_id, data})
            }, {concurrency: 5})

        //console.log('updates', updates)
        if(updates.length > 0) {
            let newSections = cloneDeep(item.sections)
            const sectionsToUpload = updates.map(({section_id, data}) => {
                let section = newSections.filter(d => d.id === section_id)?.[0]  || {}
                section.element['element-data'] = JSON.stringify(data);
                section.element['template-section-id'] = section_id; // to update sections in future
                delete section.id;
                return section;
            })

            // genetate
            const app = 'dms-site'
            const type = destination || item.type // defaults to play
            const sectionType = 'cms-section'

            const sectionConfig = {format: {app, type: sectionType}};
            const pageConfig = {format: {app, type}};

            //create all sections first, get their ids and then create the page.
            const newSectionIds = await PromiseMap(
                sectionsToUpload.map((section) => dmsDataEditor(sectionConfig, section)),
                p => p,
                {concurrency: 5});

            const newPage = {
                id_column_value: idColAttrVal,
                template_id: item.id,
                sidebar: item.sidebar,
                header: item.header,
                footer: item.footer,
                full_width: item.full_width,
                hide_in_nav: 'true', // not pulling though?
                index: 999,
                url_slug: `${url || id_column.name}/${idColAttrVal}`,
                title: `${id_column.name} ${idColAttrVal} Template`,
                sections: newSectionIds.map(sectionRes => ({
                    "id": sectionRes.id,
                    "ref": "dms-site+cms-section"
                }))
            }
            const resPage = await dmsDataEditor(pageConfig, newPage);

            console.log('created', resPage)

        }

    }), {concurrency: 5})
    setLoadingStatus(undefined)
}

export function PromiseMap (iterable, mapper, options = {}) {
  let concurrency = options.concurrency || Infinity

  let index = 0
  const results = []
  const pending = []
  const iterator = iterable[Symbol.iterator]()

  while (concurrency-- > 0) {
    const thread = wrappedMapper()
    if (thread) pending.push(thread)
    else break
  }

  return Promise.all(pending).then(() => results)

  function wrappedMapper () {
    const next = iterator.next()
    if (next.done) return null
    const i = index++
    const mapped = mapper(next.value, i)
    return Promise.resolve(mapped).then(resolved => {
      results[i] = resolved
      return wrappedMapper()
    })
  }
}