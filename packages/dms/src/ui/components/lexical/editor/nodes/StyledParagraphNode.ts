/**
 * StyledParagraphNode — a ParagraphNode that carries a `styleKey` referring
 * to a token on `theme.textSettings.styles[0]`. The node renders the token's
 * Tailwind class string at createDOM/updateDOM time, so a theme can
 * re-skin every styled paragraph by changing the token strings — no editor
 * data migration needed.
 *
 * This is the backbone for Approach B in
 * `src/dms/skills/translating-design-system-to-dms-theme.md` §3.1.4:
 * the slash menu auto-generates one option per textSettings key, each
 * `$setBlocksType`-ing the current paragraph to a StyledParagraphNode with
 * the chosen key.
 *
 * Why we subclass ParagraphNode (not ElementNode):
 *   - Paragraph semantics survive (line breaks, format, alignment).
 *   - The default ParagraphNode rendering still applies — we just layer
 *     the brand token's className on top of the editor's default paragraph
 *     class.
 *
 * Backwards-compatibility note: existing themes without
 * `textSettings.styles[0][styleKey]` defined just render the paragraph
 * without the extra class (no error, no broken output).
 */

import type {
  EditorConfig,
  LexicalEditor,
  LexicalNode,
  NodeKey,
  ParagraphNode as ParagraphNodeType,
  SerializedParagraphNode,
  Spread,
} from 'lexical';

import { $applyNodeReplacement, ParagraphNode } from 'lexical';

export type SerializedStyledParagraphNode = Spread<
  { styleKey: string },
  SerializedParagraphNode
>;

/**
 * Resolve the className for a given styleKey via the editor's theme.
 * Looks first at `theme.textSettings.styles[<activeStyle>][styleKey]`,
 * falling back to styles[0], then to ''.
 */
function resolveStyleClassName(editor: LexicalEditor, styleKey: string): string {
  if (!styleKey) return '';
  const cfg = editor._config || {};
  // The DMS theme isn't directly attached to LexicalEditor._config.theme
  // (that's the lexical-specific flat theme). The brand textSettings ride
  // through a separate context, but the editor exposes them via
  // `_config.namespace` /no, that's the namespace. The cleanest path is
  // to read off a dedicated key the editor entry sets on _config.theme,
  // namespaced under `textSettings`.
  // Convention: the editor entry point attaches the brand textSettings
  // styles[0] map to `theme.brandTextStyles` so this node can resolve.
  // If absent, the paragraph just renders with no extra class.
  const brand = (cfg.theme as Record<string, unknown> | undefined)?.brandTextStyles as
    | Record<string, string>
    | undefined;
  return brand?.[styleKey] || '';
}

export class StyledParagraphNode extends ParagraphNode {
  __styleKey: string;

  static getType(): string {
    return 'styled-paragraph';
  }

  static clone(node: StyledParagraphNode): StyledParagraphNode {
    const cloned = new StyledParagraphNode(node.__styleKey, node.__key);
    cloned.__format = node.__format;
    cloned.__indent = node.__indent;
    cloned.__dir = node.__dir;
    return cloned;
  }

  constructor(styleKey: string, key?: NodeKey) {
    super(key);
    this.__styleKey = styleKey || '';
  }

  getStyleKey(): string {
    return this.__styleKey;
  }

  setStyleKey(styleKey: string): void {
    const writable = this.getWritable();
    writable.__styleKey = styleKey || '';
  }

  // ---- DOM rendering ----------------------------------------------------

  createDOM(config: EditorConfig, editor: LexicalEditor): HTMLElement {
    const dom = super.createDOM(config);
    const extra = resolveStyleClassName(editor, this.__styleKey);
    if (extra) {
      dom.className = dom.className ? `${dom.className} ${extra}` : extra;
    }
    if (this.__styleKey) {
      dom.setAttribute('data-style-key', this.__styleKey);
    }
    return dom;
  }

  updateDOM(prevNode: this, dom: HTMLElement, config: EditorConfig): boolean {
    // Defer to the parent for format/indent/direction handling.
    const reuse = super.updateDOM(prevNode, dom, config);
    if (prevNode.__styleKey !== this.__styleKey) {
      // Lightweight: drop the old style-key class if present and reapply.
      // We don't have the editor here; rely on the next render cycle to
      // refresh the class via createDOM. Returning true triggers a recreate.
      return true;
    }
    return reuse;
  }

  // ---- Serialization ----------------------------------------------------

  static importJSON(serializedNode: SerializedStyledParagraphNode): StyledParagraphNode {
    const node = $createStyledParagraphNode(serializedNode.styleKey || '');
    node.setFormat(serializedNode.format);
    node.setIndent(serializedNode.indent);
    node.setDirection(serializedNode.direction);
    return node;
  }

  exportJSON(): SerializedStyledParagraphNode {
    return {
      ...super.exportJSON(),
      type: 'styled-paragraph',
      version: 1,
      styleKey: this.__styleKey,
    };
  }
}

export function $createStyledParagraphNode(styleKey: string): StyledParagraphNode {
  return $applyNodeReplacement(new StyledParagraphNode(styleKey));
}

export function $isStyledParagraphNode(
  node: LexicalNode | null | undefined,
): node is StyledParagraphNode {
  return node instanceof StyledParagraphNode;
}

/**
 * Helper for converting any existing ParagraphNode (or anything ParagraphNode
 * can replace) to a StyledParagraphNode with the given key. Used by the
 * slash-menu `$setBlocksType` callback.
 */
export function $convertToStyledParagraphNode(styleKey: string): StyledParagraphNode {
  return $createStyledParagraphNode(styleKey);
}

/**
 * Re-export of ParagraphNode for callers that want to round-trip:
 * `if ($isStyledParagraphNode(node)) ...; else if (node instanceof ParagraphNode) ...`
 */
export { ParagraphNode };
export type { ParagraphNodeType };
