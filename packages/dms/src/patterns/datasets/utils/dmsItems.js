/**
 * Load a DMS data_items row by ID using apiLoad with the correct format.
 *
 * Used for internal datasets where the route-level format (the parent datasets
 * pattern type) doesn't match the source item's type (e.g. 'doc_type|source').
 * By passing the correct sub-format, processNewData's type filter accepts the item.
 *
 * @param {Function} apiLoad - The apiLoad function from the wrapper
 * @param {Object} format - Format with correct app/type (e.g. sourceFormat)
 * @param {string|number} id - The DMS data_items row ID
 * @returns {Object|null} The DMS item, or null if not found
 */
export async function loadDmsItem(apiLoad, format, id) {
    const config = {
        format: {
            app: format.app,
            type: format.type,
            attributes: format.attributes || []
        },
        children: [{
            type: () => {},
            action: 'edit',
            filter: { stopFullDataLoad: true },
            path: '/:id'
        }]
    };
    const items = await apiLoad(config, `/${id}`);
    return items?.[0] || null;
}
