/**
 * Remark plugin that transforms `[N]` patterns into custom `citation-ref` MDAST
 * nodes, which react-markdown renders via the `components` prop.
 *
 * Only bare `[N]` tokens are transformed — markdown links like `[text](url)` and
 * image alts like `![alt](src)` are left untouched.
 */

import type { Root, Text, PhrasingContent } from "mdast";
import type { Plugin } from "unified";
import { visit } from "unist-util-visit";

export interface CitationRefNode {
  type: "citation-ref";
  data: {
    hName: "citation-ref";
    hProperties: { index: number };
  };
  children: [{ type: "text"; value: string }];
}

const CITATION_RE = /\[(\d+)\]/g;

const remarkCitation: Plugin<[], Root> = () => {
  return (tree: Root) => {
    visit(tree, "text", (node: Text, index, parent) => {
      if (!parent || index === undefined) return;

      const value = node.value;
      const matches = [...value.matchAll(CITATION_RE)];
      if (matches.length === 0) return;

      const children: PhrasingContent[] = [];
      let lastIndex = 0;

      for (const match of matches) {
        const matchStart = match.index!;
        const citationIndex = parseInt(match[1], 10);

        if (matchStart > lastIndex) {
          children.push({ type: "text", value: value.slice(lastIndex, matchStart) });
        }

        children.push({
          type: "citation-ref" as "text",
          data: {
            hName: "citation-ref",
            hProperties: { index: citationIndex },
          },
          children: [{ type: "text", value: match[0] }],
        } as unknown as PhrasingContent);

        lastIndex = matchStart + match[0].length;
      }

      if (lastIndex < value.length) {
        children.push({ type: "text", value: value.slice(lastIndex) });
      }

      parent.children.splice(index, 1, ...children);
    });
  };
};

export default remarkCitation;
