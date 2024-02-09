export const parseJSON = (d, fallback={}) => {
    let out = fallback
    try {
        out = JSON.parse(d)
    } catch (e) {
        //console.log('parse failed',d)
    }
    return out
}