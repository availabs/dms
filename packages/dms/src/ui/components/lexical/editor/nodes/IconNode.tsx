import React from 'react';
import type {
    DOMConversionMap,
    DOMConversionOutput,
    DOMExportOutput,
    EditorConfig,
    LexicalEditor,
    NodeKey,
} from 'lexical';
import {
    DecoratorNode,
} from 'lexical';
// import { Icons } from '../plugins/EmojiPickerPlugin';  // Make sure this is where your SVGs are stored

export class IconNode extends DecoratorNode<JSX.Element> {
    __iconName: string;

    static getType(): string {
        return 'icon';
    }

    static clone(node: IconNode): IconNode {
        return new IconNode(node.__iconName, node.__key);
    }

    constructor(iconName: string, key?: NodeKey) {
        super(key);
        this.__iconName = iconName;
    }

    static importDOM(): DOMConversionMap | null {
        return {
            span: (domNode: HTMLElement) => {
                if (!domNode.hasAttribute('data-lexical-icon')) {
                    return null;
                }
                return {
                    conversion: (domNode: HTMLElement): DOMConversionOutput => {
                        const iconName = domNode.getAttribute('data-lexical-icon');
                        if (iconName) {
                            return { node: new IconNode(iconName) };
                        }
                        return { node: null };
                    },
                    priority: 1,
                };
            },
        };
    }

    static importJSON(serializedNode): IconNode {
        return new IconNode(serializedNode.iconName);
    }

    exportJSON() {
        return {
            type: 'icon',
            version: 1,
            iconName: this.__iconName,
        };
    }

    createDOM(config): HTMLElement {
        //console.log('config icon', config)
        const span = document.createElement('span');
        span.className = 'inline-block align-middle mr-1';
        return span;
    }

    updateDOM(): false {
        return false;
    }

    exportDOM(editor: LexicalEditor): DOMExportOutput {
        const element = document.createElement('span');
        element.className = 'inline-block align-middle mr-1';
        element.setAttribute('data-lexical-icon', this.__iconName);
        // Icon SVG is rendered client-side via decorate().
        // We intentionally avoid renderToStaticMarkup here because exportDOM
        // is called from $generateHtmlFromNodes inside getHtmlSync, which runs
        // within React SSR's renderToString. React's server renderer is not
        // reentrant — calling renderToStaticMarkup during renderToString
        // corrupts the dispatcher state and crashes subsequent components.
        return {element};
    }

    decorate(editor: LexicalEditor, config: EditorConfig): JSX.Element {
        const Icon = config?.theme?.Icons?.[this.__iconName];
        if (!Icon) {
            return <span>Icon not found</span>;
        }
        return React.createElement(Icon, { className: 'w-[1.5em] h-[1.5em] -mt-[5px]' });
    }

    isInline(): true {
        return true;
    }
}

export function $createIconNode(iconName: string): IconNode {
    return new IconNode(iconName);
}
