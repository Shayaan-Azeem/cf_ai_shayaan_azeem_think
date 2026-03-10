import { invoke } from "@tauri-apps/api/core";
import type { ReactNode } from "react";

interface ChatMarkdownProps {
  content: string;
}

function openExternalUrl(url: string) {
  void invoke("open_url_safe", { url }).catch((error) => {
    console.error("[chat] Failed to open markdown link:", error);
  });
}

function parseInlineMarkdown(text: string): ReactNode {
  const parts: ReactNode[] = [];
  let key = 0;

  const patterns = [
    {
      kind: "link" as const,
      regex: /\[([^\]]+)\]\(([^)]+)\)/g,
      render: (label: string, url: string) => (
        <button
          key={key++}
          type="button"
          onClick={() => openExternalUrl(url)}
          className="text-accent hover:underline underline-offset-4"
        >
          {label}
        </button>
      ),
    },
    {
      kind: "code" as const,
      regex: /`([^`]+)`/g,
      render: (match: string) => (
        <code
          key={key++}
          className="rounded bg-bg-secondary px-1.5 py-0.5 font-mono text-[0.9em]"
        >
          {match}
        </code>
      ),
    },
    {
      kind: "bold" as const,
      regex: /(\*\*|__)(.+?)\1/g,
      render: (match: string) => (
        <strong key={key++} className="font-semibold">
          {match}
        </strong>
      ),
    },
    {
      kind: "italic" as const,
      regex: /(?<!\*)\*(?!\*)(.+?)\*(?!\*)|(?<!_)_(?!_)(.+?)_(?!_)/g,
      render: (match: string) => (
        <em key={key++} className="italic">
          {match}
        </em>
      ),
    },
  ] as const;

  let currentParts: ReactNode[] = [text];

  for (const { kind, regex, render } of patterns) {
    const nextParts: ReactNode[] = [];

    for (const part of currentParts) {
      if (typeof part !== "string") {
        nextParts.push(part);
        continue;
      }

      let lastIndex = 0;
      const matches = Array.from(part.matchAll(regex));

      for (const match of matches) {
        if (match.index == null) continue;
        if (match.index > lastIndex) {
          nextParts.push(part.slice(lastIndex, match.index));
        }

        if (kind === "link") {
          nextParts.push(render(match[1], match[2]));
        } else {
          nextParts.push(render(match[2] || match[1]));
        }

        lastIndex = match.index + match[0].length;
      }

      if (lastIndex < part.length) {
        nextParts.push(part.slice(lastIndex));
      }
    }

    currentParts = nextParts.length > 0 ? nextParts : currentParts;
  }

  parts.push(...currentParts);
  return parts;
}

export function ChatMarkdown({ content }: ChatMarkdownProps) {
  const lines = content.split("\n");
  const elements: ReactNode[] = [];
  let inCodeBlock = false;
  let codeBlockContent: string[] = [];
  let listItems: string[] = [];
  let listType: "ul" | "ol" | null = null;

  const flushList = (index: number) => {
    if (listItems.length === 0) return;

    const ListTag = listType === "ol" ? "ol" : "ul";
    elements.push(
      <ListTag
        key={`list-${index}`}
        className={
          listType === "ol"
            ? "list-decimal pl-5 space-y-1 my-2"
            : "list-disc pl-5 space-y-1 my-2"
        }
      >
        {listItems.map((item, itemIndex) => (
          <li key={`${index}-${itemIndex}`}>{parseInlineMarkdown(item)}</li>
        ))}
      </ListTag>,
    );

    listItems = [];
    listType = null;
  };

  lines.forEach((line, index) => {
    if (line.trim().startsWith("```")) {
      flushList(index);

      if (inCodeBlock) {
        elements.push(
          <pre
            key={`code-${index}`}
            className="my-3 overflow-x-auto rounded-xl bg-bg-secondary px-4 py-3 text-[13px]"
          >
            <code className="font-mono">{codeBlockContent.join("\n")}</code>
          </pre>,
        );
        codeBlockContent = [];
        inCodeBlock = false;
      } else {
        inCodeBlock = true;
      }
      return;
    }

    if (inCodeBlock) {
      codeBlockContent.push(line);
      return;
    }

    if (/^\s*[-*]\s+/.test(line)) {
      if (listType !== "ul") {
        flushList(index);
        listType = "ul";
      }
      listItems.push(line.replace(/^\s*[-*]\s+/, ""));
      return;
    }

    if (/^\s*\d+\.\s+/.test(line)) {
      if (listType !== "ol") {
        flushList(index);
        listType = "ol";
      }
      listItems.push(line.replace(/^\s*\d+\.\s+/, ""));
      return;
    }

    const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);
    if (headingMatch) {
      flushList(index);
      const level = Math.min(headingMatch[1].length, 4);
      const className =
        level === 1
          ? "text-xl font-semibold mt-4 mb-2"
          : level === 2
            ? "text-lg font-semibold mt-4 mb-2"
            : "text-base font-semibold mt-3 mb-2";
      elements.push(
        <div key={`heading-${index}`} className={className}>
          {parseInlineMarkdown(headingMatch[2])}
        </div>,
      );
      return;
    }

    const quoteMatch = line.match(/^\s*>\s?(.*)$/);
    if (quoteMatch) {
      flushList(index);
      elements.push(
        <blockquote
          key={`quote-${index}`}
          className="my-2 border-l-2 border-border px-4 py-1 text-text-muted italic"
        >
          {parseInlineMarkdown(quoteMatch[1])}
        </blockquote>,
      );
      return;
    }

    flushList(index);
    if (line.trim()) {
      elements.push(
        <p key={`line-${index}`} className="my-2 leading-7">
          {parseInlineMarkdown(line)}
        </p>,
      );
    } else if (elements.length > 0) {
      elements.push(<div key={`space-${index}`} className="h-2" />);
    }
  });

  if (inCodeBlock && codeBlockContent.length > 0) {
    elements.push(
      <pre
        key="code-unclosed"
        className="my-3 overflow-x-auto rounded-xl bg-bg-secondary px-4 py-3 text-[13px]"
      >
        <code className="font-mono">{codeBlockContent.join("\n")}</code>
      </pre>,
    );
  }

  flushList(lines.length);

  return <div className="text-sm leading-7 text-text">{elements}</div>;
}
