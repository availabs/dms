import {processNewData} from "./proecessNewData";

export async function loadFullData (fullDataLoad, app, type, itemReqByIndex, runId, dmsAttrsConfigs, format, falcor) {
    console.time(`fullDataLoad ${runId}`)
    fullDataLoad[`${ app }+${ type }`] = 'started';

    await falcor.get([
        ...itemReqByIndex,
        {from: 0, to: length-1},
        ["id", "data", "updated_at", "created_at"]
    ])
    await processNewData(falcor.getCache(), 'loadAll', null, app, type, dmsAttrsConfigs, format, falcor)
    console.timeEnd(`fullDataLoad ${runId}`)
    fullDataLoad[`${ app }+${ type }`] = 'finished';
}