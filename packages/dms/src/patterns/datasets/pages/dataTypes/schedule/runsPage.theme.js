// Runs page (schedule/RunsPage.jsx) — 2026-10-14, ui-control-tables.md. Only the run's Outputs list is
// themed so far (the rest of the page still carries its own classes). Pre-v6 values frozen in
// src/themes/_legacy/datasets.js `runsPage`.
export const runsPageTheme = {
    // Outputs list — UI.Table named style; cell text classes below
    outputsTableStyle: 'list',
    outputCell: 't-proseSM text-[var(--t-ink)]',
    outputLink: 't-proseSM text-[var(--t-cobalt)] hover:underline',   // links in text stay cobalt
    outputRows: 't-metaMD text-[var(--t-ink)] tabular-nums',
}
