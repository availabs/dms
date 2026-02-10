import { CodeNode } from '@lexical/code';
import { $isLineBreakNode } from 'lexical';
import { InlineImageNode } from './nodes/InlineImageNode';
import { CollapsibleContainerNode } from './plugins/CollapsiblePlugin/CollapsibleContainerNode';
import { CollapsibleTitleNode } from './plugins/CollapsiblePlugin/CollapsibleTitleNode';
import { CollapsibleContentNode } from './plugins/CollapsiblePlugin/CollapsibleContentNode';
import { CollapsibleButtonNode } from './plugins/CollapsiblePlugin/CollapsibleToggleButtonNode';
import { CollapsibleNoPreviewContainerNode } from './plugins/CollapsibleNoPreviewPlugin/CollapsibleNoPreviewContainerNode';
import { CollapsibleNoPreviewTitleNode } from './plugins/CollapsibleNoPreviewPlugin/CollapsibleNoPreviewTitleNode';
import { CollapsibleNoPreviewContentNode } from './plugins/CollapsibleNoPreviewPlugin/CollapsibleNoPreviewContentNode';
import { CollapsibleNoPreviewButtonNode } from './plugins/CollapsibleNoPreviewPlugin/CollapsibleNoPreviewToggleButtonNode';

const chevronSvg = '<path d="M18 9.00005C18 9.00005 13.5811 15 12 15C10.4188 15 6 9 6 9" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />';

function createChevronIcon(...extraClasses) {
  const icon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  icon.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  icon.setAttribute("viewBox", "0 0 24 24");
  icon.setAttribute("width", "24");
  icon.setAttribute("height", "24");
  icon.setAttribute("fill", "none");
  icon.innerHTML = chevronSvg;
  icon.classList.add("inline-block", "align-middle", ...extraClasses);
  return icon;
}

// referenced an internal function updateCodeGutter in @lexical/code
const generateGutter = (codeNode) => {
  const children = codeNode.getChildren();

  let gutter = '1';
  let count = 1;
  for (let i = 0; i < children.length; i++) {
    if ($isLineBreakNode(children[i])) {
      gutter += '\n' + ++count;
    }
  }

  return gutter;
};

// https://github.com/facebook/lexical/releases/tag/v0.12.3
//
// NOTE: Standard nodes (HeadingNode, ParagraphNode, QuoteNode, ListNode,
// ListItemNode, LinkNode) do NOT need overrides here. Their default exportDOM()
// already calls this.createDOM() via the LexicalNode base class, which applies
// theme classes. Overriding them with a plain createDOM call loses important
// behavior: indent handling, text-align format, direction, and empty paragraph <br>.
export const htmlConfig = {
  export: new Map([
    [
      CodeNode,
      (editor, node) => {
        // TODO: remove assertion to CodeNode after lexical fixes the type for parameter
        // https://github.com/facebook/lexical/pull/5507
        const codeNode = node;

        const element = codeNode.createDOM(editor._config);

        const gutter = generateGutter(codeNode);
        element.setAttribute('data-gutter', gutter);

        return { element };
      },
    ],
    [
      InlineImageNode,
      (editor, node) => {
        // InlineImageNode is a DecoratorNode whose default exportDOM() creates a bare <img>
        // without the themed wrapper span. We need createDOM() to apply the inlineImage
        // theme class (e.g., mt-[-120px] for Annotation Image Card).
        const span = node.createDOM(editor._config);
        const img = document.createElement('img');
        img.setAttribute('src', node.getSrc());
        img.setAttribute('alt', node.getAltText());
        // Use inline styles to match the live editor's LazyImage rendering
        img.style.display = 'block';
        if (node.__width !== 'inherit') {
          img.style.width = `${node.__width}px`;
        }
        if (node.__height !== 'inherit') {
          img.style.height = `${node.__height}px`;
        }
        span.appendChild(img);
        return { element: span };
      },
    ],

    // Collapsible (with preview) nodes
    [
      CollapsibleContainerNode,
      (editor, node) => {
        const dom = document.createElement('div');
        dom.classList.add(
          'Collapsible__container',
          'flex', 'flex-col', 'gap-4', 'bg-[#F3F8F9]', 'p-[12px]', 'pt-[16px]',
          'rounded-lg', 'mb-2', 'print:max-h-full', 'print:overflow-visible'
        );
        return { element: dom };
      },
    ],
    [
      CollapsibleTitleNode,
      (editor, node) => {
        const dom = document.createElement('div');
        dom.classList.add(
          'Collapsible__title',
          'flex', 'flex-row', 'w-full', 'font-[Oswald]', 'font-medium', 'text-[12px]',
          'text-[#2D3E4C]', 'uppercase', 'pb-[12px]', 'border-b', 'border-[#C5D7E0]',
          'items-center', 'gap-2'
        );
        dom.appendChild(createChevronIcon());
        return { element: dom };
      },
    ],
    [
      CollapsibleContentNode,
      (editor, node) => {
        const parent = node.getParent();
        const isOpen = parent && parent.__open !== undefined ? parent.__open : true;
        const dom = document.createElement('div');
        dom.classList.add(
          'Collapsible__content',
          'text-[14px]', 'leading-[19.6px]'
        );
        if (isOpen) {
          dom.classList.add('text-[#37576B]', 'overflow-auto');
        } else {
          dom.classList.add(
            'text-[#2D3E4C]', 'max-h-[64px]', 'overflow-hidden',
            '[mask-image:linear-gradient(to_bottom,_rgba(0,0,0,1),_rgba(0,0,0,0.2))]'
          );
        }
        return { element: dom };
      },
    ],
    [
      CollapsibleButtonNode,
      (editor, node) => {
        const parent = node.getParent();
        const isOpen = parent && parent.__open !== undefined ? parent.__open : true;
        const button = document.createElement('button');
        button.classList.add(
          'collapsible-toggle',
          'w-fit', 'h-fit', 'cursor-pointer', 'bg-[#C5D7E0]', 'text-[#37576B]',
          'font-semibold', 'leading-[14.62px]', 'rounded-full', 'text-sm',
          'text-center', 'pt-[9px]', 'pb-[7px]', 'px-[12px]', 'print:hidden'
        );
        button.textContent = isOpen ? 'SHOW LESS' : 'SHOW MORE';
        return { element: button };
      },
    ],

    // CollapsibleNoPreview nodes
    [
      CollapsibleNoPreviewContainerNode,
      (editor, node) => {
        const isOpen = node.__open !== undefined ? node.__open : true;
        const dom = document.createElement('div');
        dom.classList.add(
          'Collapsible__container',
          'flex', 'flex-col', 'gap-4', 'bg-[#F3F8F9]', 'p-[12px]', 'pt-[16px]',
          'rounded-lg', 'mb-2', 'print:max-h-full', 'print:overflow-visible'
        );
        if (!isOpen) {
          dom.classList.add('max-h-[50px]', 'overflow-hidden');
        }
        return { element: dom };
      },
    ],
    [
      CollapsibleNoPreviewTitleNode,
      (editor, node) => {
        const parent = node.getParent();
        const isOpen = parent && parent.__open !== undefined ? parent.__open : true;
        const dom = document.createElement('div');
        dom.classList.add(
          'Collapsible__title',
          'flex', 'flex-row', 'w-full', 'font-[Oswald]', 'font-medium', 'text-[12px]',
          'text-[#2D3E4C]', 'uppercase', 'pb-[12px]',
          'items-center', 'gap-2'
        );
        if (isOpen) {
          dom.classList.add('border-b', 'border-[#C5D7E0]');
        }
        dom.appendChild(createChevronIcon('cursor-pointer', 'absolute', 'right-2'));
        return { element: dom };
      },
    ],
    [
      CollapsibleNoPreviewContentNode,
      (editor, node) => {
        const parent = node.getParent();
        const isOpen = parent && parent.__open !== undefined ? parent.__open : true;
        const dom = document.createElement('div');
        dom.classList.add(
          'Collapsible__content',
          'text-[14px]', 'leading-[19.6px]'
        );
        if (isOpen) {
          dom.classList.add('text-[#37576B]', 'overflow-auto');
        } else {
          dom.classList.add(
            'text-[#2D3E4C]', 'max-h-[64px]', 'overflow-hidden',
            'print:overflow-visible', 'print:max-h-full'
          );
        }
        return { element: dom };
      },
    ],
    [
      CollapsibleNoPreviewButtonNode,
      (editor, node) => {
        const parent = node.getParent();
        const isOpen = parent && parent.__open !== undefined ? parent.__open : true;
        const button = document.createElement('button');
        button.classList.add(
          'collapsible-toggle',
          'w-fit', 'h-fit', 'cursor-pointer', 'bg-[#C5D7E0]', 'text-[#37576B]',
          'font-semibold', 'leading-[14.62px]', 'rounded-full', 'text-sm',
          'text-center', 'pt-[9px]', 'pb-[7px]', 'px-[12px]'
        );
        button.textContent = isOpen ? 'SHOW LESS' : 'SHOW MORE';
        return { element: button };
      },
    ],
  ]),
};
