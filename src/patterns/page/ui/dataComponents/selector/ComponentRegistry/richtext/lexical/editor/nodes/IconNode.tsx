import React from 'react';
import {
    DecoratorNode,
    SerializedDecoratorNode,
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

    static importJSON(serializedNode: any): IconNode {
        return new IconNode(serializedNode.iconName);
    }

    exportJSON(): any {
        return {
            type: 'icon',
            version: 1,
            iconName: this.__iconName,
        };
    }

    createDOM(config): HTMLElement {
        console.log('config icon', config)
        const span = document.createElement('span');
        span.className = 'inline-block align-middle mr-1';
        return span;
    }

    updateDOM(): false {
        return false;
    }

    decorate(editor: LexicalEditor, config: EditorConfig): JSX.Element {
        console.log('config in decorate', config.theme)
        const Icon = config?.theme?.Icons[this.__iconName];
        if (!Icon) {
            return <span>Icon not found</span>;
        }
        return React.createElement(Icon, { className: 'w-[1em] h-[1em]' });
    }

    isInline(): true {
        return true;
    }
}

export function $createIconNode(iconName: string): IconNode {
    return new IconNode(iconName);
}
