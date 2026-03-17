

// export const makeLexicalFormat = value => (isJson(value) ? JSON.parse(value) : value)?.root?.children ? value : {
//         root: {
//             "children": [
//                 {
//                     "children": [
//                         {
//                             "detail": 0,
//                             "format": 0,
//                             "mode": "normal",
//                             "text": value || 'No Description',
//                             "type": 'text',
//                             "version": 1
//                         },
//                         {
//                             "detail": 0,
//                             "format": 0,
//                             "mode": "normal",
//                             "text": '\n\n',
//                             "type": 'text',
//                             "version": 1
//                         }
//                     ],
//                     "tag": '',
//                     "direction": "ltr",
//                     "format": "",
//                     "indent": 0,
//                     "type": "paragraph",
//                     "version": 1
//                 }
//             ],
//             "direction": "ltr",
//             "format": "",
//             "indent": 0,
//             "type": "root",
//             "version": 1
//         }
//     };

const makeDefaultLexicalValue = value => ({
    "root": {
        "children": [
            {
                "children": [
                    {   "detail": 0,
                        "format": 0,
                        "mode": "normal",
                        "text": value || 'No Description',
                        "type": 'text',
                        "version": 1
                    },
                    {   "detail": 0,
                        "format": 0,
                        "mode": "normal",
                        "text": '\n\n',
                        "type": 'text',
                        "version": 1
                    }
                ],
                "tag": '',
                "direction": "ltr",
                "format": "",
                "indent": 0,
                "type": "paragraph",
                "version": 1
            }
        ],
        "direction": "ltr",
        "format": "",
        "indent": 0,
        "type": "root",
        "version": 1
    }
});


export const makeLexicalFormat = value => {
    try {
        const parsed = JSON.parse(value);
        return parsed?.root?.children ? parsed : makeDefaultLexicalValue(parsed);
    }
    catch (e) {
        return value?.root?.children ? value : makeDefaultLexicalValue(value);
    }
}