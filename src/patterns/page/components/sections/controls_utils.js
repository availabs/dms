export const getColumnLabel = (column) =>
    column.customName || column.display_name || column.name;
export const isEqualColumns = (column1, column2) =>
    column1?.name === column2?.name &&
    column1?.isDuplicate === column2.isDuplicate &&
    column1?.copyNum === column2?.copyNum;