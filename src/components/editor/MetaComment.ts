import { Node, type JSONContent, type MarkdownToken } from "@tiptap/core";

export const MetaComment = Node.create({
  name: "metaComment",
  group: "block",
  atom: true,

  addAttributes() {
    return {
      raw: { default: "" },
    };
  },

  parseHTML() {
    return [{ tag: "div[data-meta-comment]" }];
  },

  renderHTML({ node }) {
    return [
      "div",
      {
        "data-meta-comment": "",
        style: "display:none",
      },
      node.attrs.raw,
    ];
  },

  markdownTokenName: "metaComment",

  markdownTokenizer: {
    name: "metaComment",
    level: "block" as const,
    start: "<!--",
    tokenize(src: string) {
      const match = src.match(
        /^<!--\s*(?:cover|link|meta):\s*\S+\s*-->\s*(?:\r?\n|$)/,
      );
      if (!match) return undefined;
      return {
        type: "metaComment",
        raw: match[0],
        text: match[0].trimEnd(),
      };
    },
  },

  parseMarkdown(token: MarkdownToken, helpers) {
    return helpers.createNode("metaComment", { raw: token.text ?? "" });
  },

  renderMarkdown(node: JSONContent) {
    return `${node.attrs?.raw ?? ""}\n`;
  },
});
