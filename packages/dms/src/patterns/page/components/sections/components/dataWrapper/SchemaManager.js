/**
 * SchemaManager
 * 
 * Provides pure functions to handle schema transformations,
 * particularly for managing columns across joined data sources.
 */

export const SchemaManager = {
    /**
     * Updates columns when a join source changes.
     * 
     * @param {Array} currentColumns - The current list of columns in the main data source.
     * @param {Object} newJoinSource - The new source object (contains columns).
     * @param {string|number} newJoinSourceId - The ID of the new join source.
     * @param {string|number|null} previousJoinSourceId - The ID of the previous join source (to be removed).
     * @returns {Array} The updated list of columns.
     */
    updateColumnsForJoinSource(currentColumns, newJoinSource, newJoinSourceId, previousJoinSourceId) {
        // Filter out columns from the previous join source
        let updatedColumns = currentColumns.filter(
            (col) => !col.source_id || previousJoinSourceId !== col.source_id,
        );

        // Append new columns with the new source_id
        if (newJoinSource && newJoinSource.columns) {
            const newColumns = newJoinSource.columns.map((col) => ({
                ...col,
                source_id: newJoinSourceId,
            }));
            updatedColumns = [...updatedColumns, ...newColumns];
        }

        return updatedColumns;
    }
};
