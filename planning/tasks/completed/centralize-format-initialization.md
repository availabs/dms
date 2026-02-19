# Task: Centralize Pattern Format Initialization

## Objective

Remove duplicated `updateAttributes` and `updateRegisteredFormats` definitions from individual patterns and centralize format initialization in `dms-manager`. Currently, each pattern defines its own versions of these functions and repeats the same boilerplate to initialize formats with app/type namespacing.

## Background

### The Problem

When patterns were first developed, each pattern was deployed once per site, and the `app` and `type` from the pattern's `format.js` were sufficient to identify data in the database. When patterns became registerable multiple times (e.g., multiple "page" patterns with different base URLs), the `app+type` needed to be dynamically set at instantiation time.

This led to each pattern implementing its own:
1. Local copies of `updateRegisteredFormats` and `updateAttributes`
2. Boilerplate to clone the format, set app/type, and recursively update nested formats

The result is ~200 lines of duplicated code across patterns and inconsistent implementations.

### Current State

**Five separate definitions exist:**

| Location | Signature | Notes |
|----------|-----------|-------|
| `dms-manager/_utils.jsx` | 3-param `(formats, app, type)` | Canonical, exported from main index.js |
| `patterns/admin/siteConfig.jsx` | 2-param `(formats, app)` | Different signature, no type param |
| `patterns/page/pages/_utils/index.js` | 3-param | Identical to _utils.jsx |
| `patterns/forms/siteConfig.jsx` | 3-param | Local, not exported |
| `patterns/datasets/siteConfig.jsx` | 3-param | Identical to forms |

**Boilerplate repeated in each pattern config:**

```javascript
// This 5-line block appears 10+ times across patterns
const format = cloneDeep(baseFormat)
format.app = app
format.type = type
format.registerFormats = updateRegisteredFormats(format.registerFormats, app, type)
format.attributes = updateAttributes(format.attributes, app, type)
```

**Specific occurrences:**
- `patterns/admin/siteConfig.jsx` — lines 42-68, 144-172 (2 places)
- `patterns/page/siteConfig.jsx` — lines 61-65
- `patterns/forms/siteConfig.jsx` — lines 101-105, 243-248 (2 places)
- `patterns/datasets/siteConfig.jsx` — lines 41-45, 137-142, 232-237 (3 places)
- `render/spa/dmsSiteFactory.jsx` — lines 81-82, 200-201 (2 places)

### What These Functions Do

```javascript
updateRegisteredFormats(registerFormats, app, type)
```
Recursively walks `registerFormats` array, setting `app` and prefixing `type` on each nested format. Creates qualified type strings like `myapp+docs-page|nested-format`.

```javascript
updateAttributes(attributes, app, type)
```
Recursively walks `attributes` array, updating any `format` references to include the app+type prefix, e.g., `myapp+docs-page|referenced-format`.

These ensure that when a pattern is instantiated with a specific app name, all its nested data types are properly namespaced in the database.

## Proposed Solution

### Recommendation: Centralize in `dms-manager/_utils.jsx`

The `dms-manager` module is the right home because:
1. It already contains the canonical definitions
2. It's the layer responsible for pattern management and instantiation
3. `dmsSiteFactory` (which orchestrates pattern loading) already imports from here
4. It's not pattern-specific — all patterns can import from this shared location

**Why not `dmsSiteFactory`?**
- `dmsSiteFactory` is render/routing focused, not data/format focused
- It would mix concerns — route generation shouldn't own format namespace logic
- The functions are already in `_utils.jsx` and exported from the main index

### Implementation

#### Step 1: Add `initializePatternFormat` helper to `_utils.jsx`

```javascript
/**
 * Initialize a pattern format with app/type namespacing.
 * Clones the base format, sets app/type, and recursively updates
 * all nested registerFormats and attributes.
 *
 * @param {Object} baseFormat - The pattern's base format definition
 * @param {string} app - The app namespace (e.g., 'my-site')
 * @param {string} type - The type identifier (e.g., 'docs-page')
 * @returns {Object} - Cloned and namespaced format
 */
export function initializePatternFormat(baseFormat, app, type) {
  const format = cloneDeep(baseFormat)
  format.app = app
  format.type = type
  format.registerFormats = updateRegisteredFormats(format.registerFormats, app, type)
  format.attributes = updateAttributes(format.attributes, app, type)
  return format
}
```

#### Step 2: Standardize `updateRegisteredFormats` and `updateAttributes`

Keep the 3-param signature (already in `_utils.jsx`). The admin pattern's 2-param version can call with `type = format.type` or we update admin to use 3-param.

#### Step 3: Update patterns to import from `dms-manager/_utils`

**Before (in each pattern):**
```javascript
// Local definition of updateRegisteredFormats and updateAttributes
const updateRegisteredFormats = (registerFormats, app, type) => { ... }
const updateAttributes = (attributes, app, type) => { ... }

// Usage
const patternFormat = cloneDeep(formsFormat)
patternFormat.app = app
patternFormat.type = type
patternFormat.registerFormats = updateRegisteredFormats(patternFormat.registerFormats, app, type)
patternFormat.attributes = updateAttributes(patternFormat.attributes, app, type)
```

**After:**
```javascript
import { initializePatternFormat } from '../../dms-manager/_utils'

// Usage
const patternFormat = initializePatternFormat(formsFormat, app, type)
```

#### Step 4: Handle derived types

Some patterns create derived types (e.g., `${type}|source`). The helper supports this naturally:

```javascript
// For nested/derived formats
const sourceFormat = initializePatternFormat(sourceBaseFormat, app, `${type}|source`)
```

#### Step 5: Export from main index.js

Add to `packages/dms/src/index.js`:
```javascript
export { initializePatternFormat } from './dms-manager/_utils'
```

This allows external patterns (in themes or separate packages) to use the same initialization logic.

## Files to Modify

| File | Change |
|------|--------|
| `dms-manager/_utils.jsx` | Add `initializePatternFormat` helper |
| `packages/dms/src/index.js` | Export `initializePatternFormat` |
| `patterns/admin/siteConfig.jsx` | Remove local definitions (lines 224-245), import and use helper |
| `patterns/page/siteConfig.jsx` | Import helper, replace boilerplate |
| `patterns/page/pages/_utils/index.js` | Remove local definitions (lines 429-451), re-export from `_utils.jsx` |
| `patterns/forms/siteConfig.jsx` | Remove local definitions (lines 392-415), import and use helper |
| `patterns/datasets/siteConfig.jsx` | Remove local definitions (lines 311-334), import and use helper |
| `render/spa/dmsSiteFactory.jsx` | Update import path from admin to `_utils.jsx` |

## Testing Checklist

- [ ] Admin pattern loads and manages patterns correctly
- [ ] Page pattern creates pages with correct app+type namespacing
- [ ] Forms pattern creates sources/views with nested type prefixes (e.g., `app+forms|source`)
- [ ] Datasets pattern creates external/internal sources correctly
- [ ] Nested `dms-format` attributes resolve to correct namespaced types
- [ ] Existing data continues to load (no app+type mismatches)
- [ ] New data saves with correct app+type identifiers
- [ ] Multiple instances of the same pattern type work independently

## Benefits

1. **~200 lines of duplicated code removed** — 5 identical function definitions consolidated to 1
2. **Single source of truth** — Bug fixes and improvements apply everywhere
3. **Clearer pattern code** — Pattern configs focus on their unique logic, not boilerplate
4. **Easier pattern development** — New patterns just call `initializePatternFormat()`
5. **Consistent behavior** — No more subtle differences between pattern implementations
6. **Better discoverability** — External developers find the helper in the main exports
