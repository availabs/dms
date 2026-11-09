// Which of this pattern's rows OWN other rows, and through which attributes.
//
// The client already declares this per attribute — `type: 'dms-format'` in the format, which is
// what `api/index.js` filters on to create child rows. `dms-server` cannot read this registry, so it
// is registered in the server's `formats` table (`page+pattern`.child_refs, see ../declarations.js
// and dms-server's `scripts/register-formats.js`) and, for one more release, stamped on the pattern
// row, exactly as `authVocabulary` is.
//
// Shape:  { [ownerKind]: { [attribute]: childKind } }
//
// It answers two questions with one declaration:
//
//   1. the MIGRATION / reconciler — "for a row of kind `page`, which attributes list its children?"
//      → Object.keys(childRefs.page)
//   2. `createData` — "a row of kind `component` should name a parent of which kind?"
//      → the ownerKind whose map contains `component`
//
// (2) is what stops a component naming its PATTERN instead of its page. That claim is structurally
// valid — the pattern is in the component's type path — but it skips a level of inheritance, so it
// is permissive in the wrong direction. Nothing in a type string says pages sit between patterns
// and components; this declaration is how the server learns it without being taught any kind.
//
// PURE DATA — no imports (scripts/emit-formats.mjs loads it as a `data:` URL).

export const pageChildRefs = {
    page: {
        sections: 'component',
        draft_sections: 'component',
        history: 'page-edit',
    },
}

export default pageChildRefs
