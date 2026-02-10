import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type {
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
        const Icon = editor._config?.theme?.Icons?.[this.__iconName];
        if (Icon) {
            try {
                element.innerHTML = renderToStaticMarkup(
                    React.createElement(Icon, { className: 'w-[1.5em] h-[1.5em] -mt-[5px]' })
                );
            } catch {
                // Fallback if rendering fails
            }
        }
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
