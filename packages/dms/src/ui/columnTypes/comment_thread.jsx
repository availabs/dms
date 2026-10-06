import React from "react";
import { ThemeContext, getComponentTheme } from "../useTheme";
import { commentThreadTheme } from "./comment_thread.theme";
import { parseComments } from "./structuredText.utils";
import { formatFunctions } from "../../patterns/page/components/sections/components/dataWrapper/utils/utils";

// comment_thread column type — a comments field as a thread: one entry per comment with the
// author's initial, author, date and text. The value is a JSON array of {author, date, text} (also
// read: by/user/email, at/created, body/comment/message), or plain text with comments joined by
// " · " (text-only entries). Read-only: edit mode shows the same thread. Column attributes:
//   dateFormat — a formatFn name for each comment's date (default 'datetime'; an unparseable date
//                shows as written)
//   emptyText  — optional text when there are no comments
export const CommentThreadView = ({ value, activeStyle, emptyText, dateFormat = "datetime" }) => {
    const { theme: themeFromContext = {} } = React.useContext(ThemeContext) || {};
    const t = { ...commentThreadTheme.styles[0], ...getComponentTheme(themeFromContext, "commentThread", activeStyle) };
    const comments = parseComments(value);
    if (!comments.length) return emptyText ? <span className={t.empty}>{emptyText}</span> : null;
    const fmt = formatFunctions[dateFormat];
    // the shared date formatter prints "Invalid Date" for text it can't parse, so only parseable dates go through it
    const showDate = (d) => (fmt && !Number.isNaN(new Date(d).getTime()) && fmt(d)) || d;
    return (
        <div className={t.wrapper}>
            {comments.map((c, i) => (
                <article key={i} className={t.item}>
                    {c.author ? <span className={t.avatar} aria-hidden="true">{c.author[0]}</span> : null}
                    <div className={t.body}>
                        {c.author || c.date ? (
                            <div className={t.meta}>
                                {c.author ? <span className={t.author}>{c.author}</span> : null}
                                {c.date ? <span className={t.date}>{showDate(c.date)}</span> : null}
                            </div>
                        ) : null}
                        <p className={t.text}>{c.text}</p>
                    </div>
                </article>
            ))}
        </div>
    );
};

export const CommentThreadEdit = (props) => <CommentThreadView {...props} />;
