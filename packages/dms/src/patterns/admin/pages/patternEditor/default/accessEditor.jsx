import React from 'react';
import { PatternPermissionsEditor } from './permissionsEditor';
import { PatternFilterEditor } from './filterEditor';

// "Access" — design_system_v6/pages/admin-pattern-access.html merges the
// pattern's Permissions (who can manage it) and its row Filters (which data
// rows its sections can see) onto one page; there is no shared save state
// between them (they write different fields, `authPermissions` vs `filters`,
// each already independently save/reset-gated) — this just stacks the two
// existing editors, unchanged in behavior (2026-09-20).
export const PatternAccessEditor = (props) => (
    <div className='flex flex-col gap-4'>
        <PatternPermissionsEditor {...props} />
        <PatternFilterEditor {...props} />
    </div>
);

export default PatternAccessEditor;
