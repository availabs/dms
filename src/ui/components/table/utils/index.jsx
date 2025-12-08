export const isEqualColumns = (column1, column2) =>
    column1?.name === column2?.name &&
    column1?.isDuplicate === column2.isDuplicate &&
    column1?.copyNum === column2?.copyNum;

export const parseIfJson = str => {
    try{
        return JSON.parse(str);
    }catch (e){
        return str;
    }
}