import React from "react";

export const searchTypeMapping = {
    tags: 'byTag',
    page_title: 'byPageTitle'
}

export const getScore = (valuesToMatch, query) => {
    const regex = new RegExp(`(${query})`, 'gi');

    return valuesToMatch.filter(v => v).reduce((acc, value) => value.toLowerCase() === query.toLowerCase() ? acc + 1 : regex.test(value) ? acc + 0.5 : acc, 0);
}

export const boldMatchingText = (text, query) => {
    if (!query) return text; // If there's no query, just return the original text.

    const parts = text.split(new RegExp(`(${query})`, 'gi')); // 'gi' for case-insensitive search
    return (
        <>
            {parts.map((part, index) =>
                part.toLowerCase() === query.toLowerCase() ?
                    <React.Fragment key={index}>
                        <div className="inline-block font-bold">
                            {index > 0 && parts[index - 1]?.endsWith(' ') ? ' ' : ''}
                            {part}
                            {index < parts.length - 1 && part[index + 1]?.startsWith(' ') ? ' ' : ''}
                        </div>
                    </React.Fragment> :
                    part
            )}
        </>
    );
};
