// Redesigned to match design_system_v6/pages/admin-pattern-activity.html (2026-09-21) —
// a day-grouped feed (avatar + colored action badge + page link + actor + time), not a
// generic data-grid table. Badge colors use the real tessera semantic tokens directly
// (t-go/t-amber/t-brick/t-cobalt) since this is new markup, unlike pagesEditor.theme.js's
// literal-Tailwind-color badges (a decision specific to preserving that file's pre-existing
// pre-tessera badges).
export const activityTabTheme = {
    // toolbar: quick action-category chips + actor filter, one row, flush on the page
    // background (same reasoning as pagesEditor.theme.js's header/toolbar).
    toolbar: 'flex items-center gap-2 flex-wrap pt-3 pb-3 border-b border-[var(--t-rule)] flex-shrink-0',
    chipBar: 'hidden sm:flex items-center gap-1.5',

    feedWrap: 'flex-1 min-h-0 overflow-auto',
    feedCard: 'bg-[var(--t-panel)] border border-[var(--t-rule)] rounded-lg overflow-hidden',
    feedDayHeader: 'px-4 py-1.5 bg-[var(--t-well)] border-b border-[var(--t-rule)] t-metaXS text-[var(--t-pencil)]',
    feedRow: 'px-4 py-2 border-b border-[var(--t-rule)] last:border-b-0 flex items-center gap-3 hover:bg-[var(--t-well)] transition-colors duration-150',
    feedAvatar: 'w-6 h-6 rounded-full bg-[var(--t-well)] text-[var(--t-ink)] flex items-center justify-center t-metaXS flex-none',   // avatars neutral (owner 2026-10-13)
    feedActor: 't-metaXS text-[var(--t-pencil)] hidden md:block',
    feedTime: 't-metaXS text-[var(--t-pencil)] w-16 text-right flex-none',

    activityPageName: 't-proseSM font-medium text-[var(--t-ink)] truncate',
    activityEmpty: 'flex items-center justify-center h-32 text-[var(--t-pencil)] t-proseSM italic',

    // action badges
    badgePublish: 'inline-flex items-center gap-1.5 h-[18px] px-1.5 rounded t-metaXS bg-[var(--t-go-soft)] text-[var(--t-go)] flex-none',
    badgeEdit: 'inline-flex items-center gap-1.5 h-[18px] px-1.5 rounded t-metaXS bg-[var(--t-cobalt-soft)] text-[var(--t-cobalt)] flex-none',
    badgeDiscard: 'inline-flex items-center gap-1.5 h-[18px] px-1.5 rounded t-metaXS bg-[var(--t-amber-soft)] text-[var(--t-amber)] flex-none',
    badgeNeutral: 'inline-flex items-center gap-1.5 h-[18px] px-1.5 rounded t-metaXS bg-[var(--t-well)] text-[var(--t-graphite)] flex-none',
    badgeDelete: 'inline-flex items-center gap-1.5 h-[18px] px-1.5 rounded t-metaXS bg-[var(--t-brick-soft)] text-[var(--t-brick)] flex-none',
}
