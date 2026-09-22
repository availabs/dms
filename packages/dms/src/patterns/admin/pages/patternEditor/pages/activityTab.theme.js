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
    feedAvatar: 'w-6 h-6 rounded-full bg-[var(--t-cobalt)] text-[var(--t-accent-ink)] flex items-center justify-center t-metaXS flex-none',
    feedActor: 't-metaXS text-[var(--t-pencil)] hidden md:block',
    feedTime: 't-metaXS text-[var(--t-pencil)] w-16 text-right flex-none',

    activityPageLink: 't-proseSM font-medium text-[var(--t-ink)] hover:text-[var(--t-cobalt)] text-left bg-transparent border-none cursor-pointer p-0 truncate',
    activityPageName: 't-proseSM font-medium text-[var(--t-ink)] truncate',
    activityEmpty: 'flex items-center justify-center h-32 text-[var(--t-pencil)] t-proseSM italic',

    // action badges
    badgePublish: 't-metaXS text-[var(--t-go)] bg-[var(--t-go-soft)] rounded-full px-2 py-0.5 flex-none',
    badgeEdit: 't-metaXS text-[var(--t-cobalt)] bg-[var(--t-cobalt-soft)] rounded-full px-2 py-0.5 flex-none',
    badgeDiscard: 't-metaXS text-[var(--t-amber)] bg-[var(--t-amber-soft)] rounded-full px-2 py-0.5 flex-none',
    badgeNeutral: 't-metaXS text-[var(--t-graphite)] bg-[var(--t-well)] border border-[var(--t-rule)] rounded-full px-2 py-0.5 flex-none',
    badgeDelete: 't-metaXS text-[var(--t-brick)] bg-[var(--t-brick-soft)] rounded-full px-2 py-0.5 flex-none',
}
