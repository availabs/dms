// Parsers for the read-only column types that show a text field's structure: kv_chips (an
// environment record as label / value chips) and comment_thread (a comments field as a thread).
// Each accepts the JSON the field is meant to hold, or the plain text older rows hold instead,
// where entries are joined with " · " (TransportNY's sitemgmt tickets: env "1528×732 · <UA>",
// comments "note · resolved (2026-10-02)").

export const ENTRY_SEPARATOR = ' · '

// A cell value can arrive wrapped ({value, originalValue}) from a formatted column.
const unwrap = (value) =>
    value && typeof value === 'object' && !Array.isArray(value) && ('value' in value || 'originalValue' in value)
        ? (value.value ?? value.originalValue)
        : value

// JSON text → its value; anything else as-is. Only text that looks like an object or array is
// parsed, so a plain sentence never turns into a number or boolean.
const parseJsonText = (value) => {
    if (typeof value !== 'string') return value
    const s = value.trim()
    if (!/^[[{]/.test(s)) return value
    try { return JSON.parse(s) } catch { return value }
}

const asText = (v) => (v === null || v === undefined ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v)).trim()
const splitText = (s) => s.split(ENTRY_SEPARATOR).map(t => t.trim()).filter(Boolean)

// → [{ label, value }] (label '' for an unlabeled entry)
export const parseKvChips = (raw) => {
    const v = parseJsonText(unwrap(raw))
    if (v === null || v === undefined || v === '') return []
    if (Array.isArray(v)) {
        return v.map(item => item && typeof item === 'object'
            ? { label: asText(item.label ?? item.key ?? item.name), value: asText(item.value) }
            : { label: '', value: asText(item) }
        ).filter(c => c.value)
    }
    if (typeof v === 'object') {
        return Object.entries(v).map(([label, value]) => ({ label, value: asText(value) })).filter(c => c.value)
    }
    return splitText(String(v)).map(value => ({ label: '', value }))
}

// → [{ author, date, text }] (author / date '' when the entry has none)
export const parseComments = (raw) => {
    const v = parseJsonText(unwrap(raw))
    if (v === null || v === undefined || v === '') return []
    const fromObject = (o) => ({
        author: asText(o.author ?? o.by ?? o.user ?? o.email),
        date: asText(o.date ?? o.at ?? o.created ?? o.created_at),
        text: asText(o.text ?? o.body ?? o.comment ?? o.message),
    })
    if (Array.isArray(v)) {
        return v.map(item => item && typeof item === 'object' ? fromObject(item) : { author: '', date: '', text: asText(item) })
            .filter(c => c.text)
    }
    if (typeof v === 'object') return [fromObject(v)].filter(c => c.text)
    return splitText(String(v)).map(text => ({ author: '', date: '', text }))
}
