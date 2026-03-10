import { Node, type JSONContent, type MarkdownToken } from "@tiptap/core";

export const Hashtag = Node.create({
  name: "hashtag",
  group: "inline",
  inline: true,
  atom: true,

  addAttributes() {
    return {
      tag: {
        default: null,
        parseHTML: (element) => element.getAttribute("data-tag"),
        renderHTML: (attributes) => ({
          "data-tag": attributes.tag,
        }),
      },
    };
  },

  parseHTML() {
    return [{ tag: "span[data-hashtag]" }];
  },

  renderHTML({ node }) {
    const tag = String(node.attrs.tag ?? "").trim();
    return [
      "span",
      {
        "data-hashtag": "",
        "data-tag": tag,
      },
      `#${tag}`,
    ];
  },

  markdownTokenName: "hashtag",

  markdownTokenizer: {
    name: "hashtag",
    level: "inline" as const,
    start: "#",
    tokenize(src: string, _tokens: MarkdownToken[]) {
      const match = src.match(/^#([a-z0-9][a-z0-9_-]*)\b/i);
      if (!match) return undefined;
      return {
        type: "hashtag",
        raw: match[0],
        text: match[1].toLowerCase(),
      };
    },
  },

  parseMarkdown(token: MarkdownToken, helpers) {
    return helpers.createNode("hashtag", { tag: token.text });
  },

  renderMarkdown(node: JSONContent) {
    return `#${node.attrs?.tag ?? ""}`;
  },
});
