//import { Promise } from "bluebird";
import { parseJSON } from '../utils/parseJSON'
import { RegisteredComponents } from '../../../selector'
import {dmsDataEditor, dmsDataLoader} from '../../../../../index'
import cloneDeep from 'lodash/cloneDeep'
import {getConfig} from "../../template/pages";



export const generatePages = async ({
                                        item, url, destination, id_column, dataRows, falcor, setLoadingStatus, generatedPages
                                    }) => {
    // const disaster_numbers = ['4020', '4031']

    setLoadingStatus('Generating Pages...', dataRows)
    const idColAttr =
        dataRows
            // .filter(d => !d?.state_fips || d.state_fips === '36')
            .sort((a,b) => a?.state_fips ? +b[id_column.name] - +a[id_column.name] : true)
            .map(d => d[id_column.name])
    .filter((d,i) => (d && (i <= 1)))

    let i = 0;
    // console.log('generatePages', idColAttr, dataRows)
    //console.time('Pages generated in:')
    await PromiseMap(idColAttr, (async(idColAttrVal, pageI) => {
        // await acc;
        const existingPage = generatedPages?.find(page => page.data.value.id_column_value === idColAttrVal);
        const sectionIds =  existingPage?.data?.value?.sections?.map(section => section.id) || [];
        setLoadingStatus(`${existingPage ? `Updating` : 'Generating'} page ${++i}/${idColAttr?.length}`);

        const generatedSections = await sectionIds.reduce(async (acc, sectionId) => { //dont load data here?
            const prevSections = await acc;
            const currentSections = await dmsDataLoader(
                getConfig({
                    app: 'dms-site',
                    type: 'cms-section',
                    filter: {
                        'id': [sectionId] // [] of ids
                    }
                }), '/');

            return [...prevSections, ...currentSections];
        }, Promise.resolve([]));


        const dataControls = item.data_controls;
        const activeDataRow = dataRows.find(dr => dr[id_column.name] === idColAttrVal) || {};

        let updates = await PromiseMap(item.sections.map(s => s.id), async section_id => {
            let templateSection = item.sections.find(d => d.id === section_id)  || {};
            // let pageSection = generatedSections.find(s => s.data.value.element['template-section-id'] === section_id); // if we don't need to pull this data, save resources.
            let data = parseJSON(templateSection?.element?.['element-data']) || {}
            let type = templateSection?.element?.['element-type'] || ''
            let comp = RegisteredComponents[type] || {}


            let controlVars = (comp?.variables || []).reduce((out,curr) => {
                out[curr.name] = curr.name === id_column.name ? idColAttrVal : data[curr.name]
                return out
            },{})

            let updateVars = Object.keys(dataControls?.sectionControls?.[section_id] || {}) // check for id_col
                .reduce((out,curr) => {
                    const attrName = dataControls?.sectionControls?.[section_id]?.[curr]?.name || dataControls?.sectionControls?.[section_id]?.[curr];

                    out[curr] = attrName === id_column.name ? idColAttrVal : (activeDataRow[attrName] || dataControls?.active_row?.[attrName] || null)
                    return out
                },{})

            let args = {...controlVars, ...updateVars}
            return comp?.getData ? comp.getData(args,falcor).then(data => ({section_id, data, type})) : ({section_id, data})
        }, {concurrency: 5})

        //console.log('updates', updates)
        if(updates.length > 0) {
            // console.log('updates len', updates, idColAttrVal, item.sections)
            // titles not updating once page gets created...
            // check for data too, but resolve title first.
            //     maybe update is not happening at all? compare code with updatePages.js
            const updatedSections = item.sections
                .map(s => updates.find(u => u.section_id === s.id) || s) // to preserve order
                .filter(u => u)
                .map(({section_id, data, type}) => {
                    let templateSection = item.sections.find(d => d.id === section_id)  || {};
                    let pageSection = generatedSections.find(d => d.data.value.element['template-section-id'] === section_id)  || {};
                    let section = pageSection?.data?.value || {element:{}};

                    if(pageSection?.id){
                        section.id = pageSection?.id; // to prevent creating new section
                    }

                    section.title = templateSection.title;
                    section.level = templateSection.level;
                    section.size = templateSection.size;
                    section.tags = templateSection.tags;
                    section.element['element-data'] = JSON.stringify(data);
                    section.element['element-type'] = type;
                    section.element['template-section-id'] = section_id; // to update sections in future
                    // console.log('section', section, templateSection)
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
                updatedSections.map((section) => dmsDataEditor(sectionConfig, section)),
                p => p,
                {concurrency: 5});

            const newPage = {
                ...existingPage && {id: existingPage.id},
                ...cloneDeep(existingPage?.data?.value || {}),
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
                sections: [
                    ...updatedSections.map((section, i) => ({ // updatedSections contains correct order
                        "id": section.id || newSectionIds[i]?.id,
                        "ref": "dms-site+cms-section"
                    })),
                    ...generatedSections.filter(section => !section.data.value.element['template-section-id']) // non-template sections
                        .map((section, i) => ({
                            "id": section.id,
                            "ref": "dms-site+cms-section"
                        })),
                ]
            }
            const resPage = await dmsDataEditor(pageConfig, newPage);

            // console.log('created', resPage)

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