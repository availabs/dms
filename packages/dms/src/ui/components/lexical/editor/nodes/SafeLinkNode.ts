/**
 * SafeLinkNode — a drop-in replacement for the built-in `@lexical/link` LinkNode that
 * guarantees `rel="noopener noreferrer"` on any link rendered with `target="_blank"`.
 *
 * Why this exists: the built-in LinkNode only emits a `rel` attribute when its `__rel`
 * field is truthy, and the project's LinkPlugin historically created links with `target`
 * but no `rel`. That leaves published `<a target="_blank">` links able to reach
 * `window.opener` (reverse tabnabbing — Qualys WAS 150222).
 *
 * Registered as a node-replacement for LinkNode (see PlaygroundNodes.ts). Because
 * `$createLinkNode` (and therefore `LinkNode.importJSON`) routes through
 * `$applyNodeReplacement`, every link — freshly authored *and* already-stored content
 * loaded into the read-only view — becomes a SafeLinkNode on create/deserialize, and gets
 * the safe `rel` injected at render time without any per-page data migration.
 *
 * Type handling: Lexical's node-replacement model requires the replacement class to have
 * its own `getType()` (the base `'link'` type is reserved for the stock LinkNode, enforced
 * by both `errorOnTypeKlassMismatch` at construction and the `exportJSON().type ===
 * getType()` assertion). So this node serializes as `'safe-link'`. Existing stored `'link'`
 * content still deserializes through the replacement into a SafeLinkNode and gets the safe
 * `rel` at render time — no data migration needed; the serialized type only changes for
 * links that are newly authored or re-saved after this ships.
 */
import { LinkNode, type LinkAttributes, type SerializedLinkNode } from '@lexical/link';
import type { EditorConfig, NodeKey } from 'lexical';

type AnchorEl = HTMLAnchorElement | HTMLSpanElement;

const REQUIRED_REL_TOKENS = ['noopener', 'noreferrer'];

// Merge the required security tokens into any author-set rel (e.g. "nofollow"),
// preserving existing tokens rather than clobbering them.
function ensureSafeRel(existing: string | null): string {
  const tokens = new Set((existing || '').split(/\s+/).filter(Boolean));
  for (const token of REQUIRED_REL_TOKENS) {
    tokens.add(token);
  }
  return Array.from(tokens).join(' ');
}

export class SafeLinkNode extends LinkNode {
  static getType(): string {
    return 'safe-link';
  }

  static clone(node: SafeLinkNode): SafeLinkNode {
    return new SafeLinkNode(
      node.__url,
      { rel: node.__rel, target: node.__target, title: node.__title },
      node.__key,
    );
  }

  constructor(url = '', attributes: LinkAttributes = {}, key?: NodeKey) {
    super(url, attributes, key);
  }

  // Inject the safe rel onto the rendered anchor whenever the link opens a new tab.
  // tagName check guards against the span fallback used by unlinked autolinks.
  private applySafeRel(anchor: AnchorEl): void {
    if (this.getTarget() !== '_blank') {
      return;
    }
    if (anchor.tagName !== 'A') {
      return;
    }
    anchor.setAttribute('rel', ensureSafeRel(anchor.getAttribute('rel')));
  }

  createDOM(config: EditorConfig): AnchorEl {
    const element = super.createDOM(config);
    this.applySafeRel(element);
    return element;
  }

  updateDOM(prevNode: this, anchor: AnchorEl, config: EditorConfig): boolean {
    const updated = super.updateDOM(prevNode, anchor, config);
    this.applySafeRel(anchor);
    return updated;
  }

  // Persist the safe rel for `_blank` links so the stored JSON is self-protecting.
  // (type is 'safe-link', inherited from getType() — required by Lexical's invariant.)
  exportJSON(): SerializedLinkNode {
    const json = super.exportJSON() as SerializedLinkNode;
    if (this.getTarget() === '_blank') {
      return { ...json, rel: ensureSafeRel(this.getRel()) };
    }
    return json;
  }
}
