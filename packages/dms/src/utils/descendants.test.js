import { describe, test, expect } from 'vitest'
import { descendantsOf } from './descendants'

describe('descendantsOf', () => {
    const rows = [
        { id: 1 }, { id: 2, parent: '1' }, { id: 3, parent: 2 }, { id: 4, parent: '1' }, { id: 5, parent: '' }, { id: 6, parent: '9' },
    ]
    test('every descendant, depth first in list order, with its depth', () => {
        expect(descendantsOf(1, rows).map(({ row, depth }) => [row.id, depth])).toEqual([[2, 1], [3, 2], [4, 1]])
    })
    test('a leaf has none; ids compare as strings', () => {
        expect(descendantsOf('3', rows)).toEqual([])
        expect(descendantsOf('2', rows).map(d => d.row.id)).toEqual([3])
    })
    test('a cycle ends the walk instead of looping, and never lists the root', () => {
        const cyc = [{ id: 1, parent: 2 }, { id: 2, parent: 1 }, { id: 3, parent: 3 }]
        expect(descendantsOf(1, cyc).map(d => d.row.id)).toEqual([2])
        expect(descendantsOf(3, cyc)).toEqual([])
    })
})
