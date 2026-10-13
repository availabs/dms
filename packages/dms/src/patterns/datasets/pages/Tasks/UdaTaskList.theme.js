// Task list (pages/Tasks/UdaTaskList.jsx — /tasks, and the Tasks card on a source's Admin page) and the
// /tasks page chrome (UdaTasks.jsx) — tessera v6, 2026-10-07, from
// src/themes/tessera/design_system_v6/pages/datasets-tasks.html. Status chips come from
// `datasets.udaTaskPage`. The list was unthemed before; src/themes/_legacy/datasets.js `udaTaskList`
// reproduces it ('' table → UI.Table).
const RULE = 'border-[var(--t-rule)]';

export const udaTaskListTheme = {
    // UdaTasks.jsx — the /tasks page
    page: 'w-full max-w-[1200px] pl-6 lg:pl-12 pr-6 lg:pr-8 py-6',       // '' → LayoutGroup (pre-v6)
    header: 'flex flex-wrap items-baseline gap-x-3 gap-y-1 mb-4',          // '' → no heading
    title: 't-displayMD text-[var(--t-ink)]',
    hint: 't-metaXS text-[var(--t-pencil)]',
    card: `rounded-lg border ${RULE} bg-[var(--t-panel)] overflow-hidden`,

    // UdaTaskList.jsx
    wrapper: 'w-full',
    table: 'w-full',                                                       // '' → UI.Table (pre-v6)
    tableScroll: 'overflow-x-auto',
    th: 'px-3 py-2 text-left font-normal t-metaXS text-[var(--t-pencil)] whitespace-nowrap',
    tr: `border-t ${RULE} hover:bg-[var(--t-well)]`,
    td: 'px-3 py-2 t-proseSM text-[var(--t-ink)] align-top',
    idLink: 't-metaMD text-[var(--t-ink)] underline decoration-[var(--t-rule-strong)] underline-offset-2 hover:decoration-[var(--t-ink)]',
    typeCell: 'whitespace-nowrap',
    startedCell: 'text-[var(--t-graphite)] whitespace-nowrap',
    durationCell: 't-metaMD text-[var(--t-graphite)] whitespace-nowrap',
    // no tasks — '' → render nothing (pre-v6)
    emptyWrapper: 'm-4 flex flex-col items-center text-center border border-dashed border-[var(--t-rule-strong)] rounded-lg px-6 py-10',
    emptyTitle: 't-proseSM font-medium text-[var(--t-ink)]',
    emptyText: 't-proseSM text-[var(--t-graphite)] mt-1 max-w-[52ch]',
}
