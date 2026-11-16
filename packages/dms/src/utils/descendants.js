// Every row below `rootId` in a tree whose rows name their parent's id in `parentKey`, depth first and in
// list order, as `{ row, depth }` (depth 1 = a direct child). A row is visited once, so a cycle or a row
// naming itself ends the walk instead of looping. Pure.
//
// Shared by every delete that takes a row's subtree with it (the page editor's Pages pane and the admin
// Pages tab, which may not import from each other): the caller lists the subtree in its warning and sends
// the ids with the delete, and the server judges each one (safe-delete-removes-rows.md, F3).
export function descendantsOf(rootId, rows = [], parentKey = 'parent') {
    const byParent = new Map();
    for (const row of rows || []) {
        const parent = row?.[parentKey];
        if (parent === undefined || parent === null || parent === '') continue;
        const key = String(parent);
        if (!byParent.has(key)) byParent.set(key, []);
        byParent.get(key).push(row);
    }
    const out = [];
    const seen = new Set([String(rootId)]);
    const walk = (id, depth) => {
        for (const row of byParent.get(String(id)) || []) {
            const rowId = String(row.id);
            if (seen.has(rowId)) continue;
            seen.add(rowId);
            out.push({ row, depth });
            walk(rowId, depth + 1);
        }
    };
    walk(rootId, 1);
    return out;
}
