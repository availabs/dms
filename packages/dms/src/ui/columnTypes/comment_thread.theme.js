// Theme for the comment_thread column type (ui/columnTypes/comment_thread.jsx). Named styles, picked
// per column by its "Column Type Style" (`activeStyle`).
//   wrapper   the thread
//   item      one comment
//   avatar    the author's initial (not drawn for a comment with no author)
//   body      the column beside the avatar
//   meta      the author / date line
//   author, date, text
//   empty     the column's `emptyText`, shown when there are no comments
export const commentThreadTheme = {
    options: { activeStyle: 0 },
    styles: [
        {
            name: 'default',
            wrapper: 'flex flex-col',
            item: 'flex gap-3 py-3 border-t border-[var(--t-rule)] first:border-t-0',
            avatar: 'w-7 h-7 flex-none rounded-md bg-[var(--t-cobalt-soft)] text-[var(--t-cobalt)] t-metaSM flex items-center justify-center',
            body: 'min-w-0',
            meta: 'flex flex-wrap items-baseline gap-x-2',
            author: 't-proseSM font-medium text-[var(--t-ink)]',
            date: 't-metaXS normal-case tracking-normal text-[var(--t-pencil)]',
            text: 't-proseSM text-[var(--t-ink)] whitespace-pre-wrap',
            empty: 't-proseSM text-[var(--t-pencil)]',
        },
    ],
};
