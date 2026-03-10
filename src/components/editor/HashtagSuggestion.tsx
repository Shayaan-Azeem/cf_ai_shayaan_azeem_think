import { Extension } from "@tiptap/core";
import { PluginKey } from "@tiptap/pm/state";
import { ReactRenderer } from "@tiptap/react";
import Suggestion from "@tiptap/suggestion";
import tippy, { type Instance as TippyInstance } from "tippy.js";
import {
  TAG_SUGGESTIONS,
  type TagSuggestion,
} from "../../lib/note-tags";
import {
  HashtagSuggestionList,
  type HashtagSuggestionListRef,
} from "./HashtagSuggestionList";

const hashtagSuggestionPluginKey = new PluginKey("hashtagSuggestion");

export const HashtagSuggestion = Extension.create({
  name: "hashtagSuggestion",

  addProseMirrorPlugins() {
    return [
      Suggestion<TagSuggestion>({
        editor: this.editor,
        char: "#",
        pluginKey: hashtagSuggestionPluginKey,
        startOfLine: false,
        allowSpaces: false,

        allow: ({ editor, range }) => {
          if (
            editor.isActive("codeBlock") ||
            editor.isActive("frontmatter") ||
            editor.isActive("code")
          ) {
            return false;
          }

          const docTextBefore = editor.state.doc.textBetween(
            Math.max(0, range.from - 1),
            range.from,
            "",
          );

          // Don't trigger for in-word patterns like "abc#tag".
          return docTextBefore.length === 0 || /\s|[(\[{'"`]/.test(docTextBefore);
        },

        items: ({ query }) => {
          const q = query.trim().toLowerCase();
          if (!q) return TAG_SUGGESTIONS;

          const matches = TAG_SUGGESTIONS.filter(
            (item) =>
              item.value.includes(q) ||
              item.label.toLowerCase().includes(q) ||
              item.description.toLowerCase().includes(q),
          );

          const hasExactMatch = matches.some((item) => item.value === q);
          if (!hasExactMatch) {
            matches.unshift({
              value: q,
              label: `#${q}`,
              description: "Create custom tag",
            });
          }

          return matches.slice(0, 10);
        },

        command: ({ editor, range, props: tag }) => {
          editor
            .chain()
            .focus()
            .deleteRange(range)
            .insertContent({
              type: "hashtag",
              attrs: { tag: tag.value },
            })
            .insertContent(" ")
            .run();
        },

        render: () => {
          let component: ReactRenderer<HashtagSuggestionListRef> | null = null;
          let popup: TippyInstance | null = null;

          return {
            onStart: (props) => {
              component = new ReactRenderer(HashtagSuggestionList, {
                props: {
                  items: props.items,
                  command: props.command,
                },
                editor: props.editor,
              });

              popup = tippy(document.body, {
                getReferenceClientRect: () =>
                  props.clientRect?.() ?? new DOMRect(),
                appendTo: () => document.body,
                content: component.element,
                showOnCreate: true,
                interactive: true,
                trigger: "manual",
                placement: "bottom-start",
                offset: [0, 4],
                popperOptions: {
                  modifiers: [
                    {
                      name: "flip",
                      options: { fallbackPlacements: ["top-start"] },
                    },
                  ],
                },
              });
            },

            onUpdate: (props) => {
              component?.updateProps({
                items: props.items,
                command: props.command,
              });

              popup?.setProps({
                getReferenceClientRect: () =>
                  props.clientRect?.() ?? new DOMRect(),
              });
            },

            onKeyDown: (props) => {
              if (props.event.key === "Escape") {
                popup?.hide();
                return true;
              }
              return component?.ref?.onKeyDown(props) ?? false;
            },

            onExit: () => {
              popup?.destroy();
              component?.destroy();
              popup = null;
              component = null;
            },
          };
        },
      }),
    ];
  },
});
