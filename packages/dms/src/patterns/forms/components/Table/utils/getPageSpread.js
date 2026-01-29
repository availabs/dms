export const getPageSpread = (page, maxPage) => {
    let low = page - 2,
        high = page + 2;

    if (low < 0) {
        high += -low;
        low = 0;
    }
    if (high > maxPage) {
        low -= (high - maxPage);
        high = maxPage;
    }
    const spread = [];
    for (let i = Math.max(0, low); i <= Math.min(maxPage, high); ++i) {
        spread.push(i);
    }
    return spread;
}