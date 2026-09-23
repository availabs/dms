// Redesigned to match design_system_v6/pages/admin-pattern-data.html (2026-09-21) — a
// faithful mock of this component's REAL feature set (status/origin filters, free-text
// search, an orphan-sources warning banner, manual refresh, Name/Origin/Used-By/Views/
// Status table), not the file's earlier "preview" ghost table, which depicted a
// rows/size/kind model no code implements.
//
// Status pills now share the same go/amber tokens as the header's stat pills (previously
// literal emerald-50/amber-50 with a semi-transparent accent-token border that read as a
// bright glow in dark mode — flagged live). Origin badges are a single neutral style
// (previously a bright indigo-50 "Internal" pill, also flagged) since Internal vs External
// is a distinction carried by the label text, not a status worth its own color.
export const sourcesTabTheme = {
    origin: 't-metaXS font-semibold text-[var(--t-graphite)] bg-[var(--t-well)] rounded px-1.5 py-0.5',
    statusActive: 't-metaXS font-semibold text-[var(--t-go)] bg-[var(--t-go-soft)] rounded-full px-2 py-0.5',
    statusOrphaned: 't-metaXS font-semibold text-[var(--t-amber)] bg-[var(--t-amber-soft)] rounded-full px-2 py-0.5',

    orphanBanner: 'px-4 py-2.5 bg-[var(--t-amber-soft)] border border-[var(--t-amber)]/40 rounded-lg flex flex-wrap items-center gap-2 flex-shrink-0',
    orphanBannerStrong: 't-proseSM font-medium text-[var(--t-amber)]',
    orphanBannerNote: 't-metaSM text-[var(--t-amber)] opacity-80',

    sectionsLoadingBadge: 'ml-3 inline-flex items-center gap-1.5 text-[var(--t-pencil)]',
    sectionsLoadingDot: 'inline-block w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse',
    usedByLink: 't-metaSM text-[var(--t-cobalt)] hover:text-[var(--t-cobalt-deep)] hover:underline font-medium',
    usedByEmpty: 't-metaSM text-[var(--t-pencil)]',
};
