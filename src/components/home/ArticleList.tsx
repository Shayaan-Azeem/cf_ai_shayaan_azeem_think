import { useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Menu, MenuItem, Submenu, PredefinedMenuItem } from "@tauri-apps/api/menu";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { cleanTitle } from "../../lib/utils";
import * as notesService from "../../services/notes";
import type { NoteMetadata } from "../../types/note";

export interface ArticleListProps {
  notes: NoteMetadata[];
  sectionType: string;
  onOpenNote: (id: string) => void;
  onStatusChange?: () => void;
  onChangeIcon?: (noteId: string) => void;
  isDragOver?: boolean;
}

const STATUS_TAGS = ["to-read", "toread", "queue", "upnext", "later", "reading", "in-progress", "inprogress", "current", "have-read", "haveread", "read", "done", "finished"];

const STATUS_REGEX = new RegExp(
  `(^|\\s)#(${STATUS_TAGS.join("|")})(?=\\s|$)`,
  "gi",
);

const TYPE_TAGS = ["book", "books", "blog", "substack", "newsletter", "post", "technical", "tech", "engineering", "tutorial", "docs", "journal", "journaling", "diary", "log", "link", "links", "bookmark", "twitter", "tweet", "x", "note", "notes", "article", "essay", "paper"];

const TYPE_REGEX = new RegExp(
  `(^|\\s)#(${TYPE_TAGS.join("|")})(?=\\s|$)`,
  "gi",
);

export async function changeNoteStatus(noteId: string, newStatus: string) {
  const note = await notesService.readNote(noteId);
  let content = note.content;
  const hasStatus = STATUS_REGEX.test(content);
  STATUS_REGEX.lastIndex = 0;

  if (hasStatus) {
    content = content.replace(STATUS_REGEX, `$1#${newStatus}`);
  } else {
    content = content.trimEnd() + `\n\n#${newStatus}\n`;
  }

  await notesService.saveNote(noteId, content);
}

const COVER_RE = /<!--\s*cover:\s*.+?\s*-->/;

export async function changeNoteIcon(noteId: string, value: string | null) {
  const note = await notesService.readNote(noteId);
  let content = note.content;

  if (value) {
    if (COVER_RE.test(content)) {
      content = content.replace(COVER_RE, `<!-- cover: ${value} -->`);
    } else {
      content = content.trimEnd() + `\n<!-- cover: ${value} -->\n`;
    }
  } else {
    content = content.replace(COVER_RE, "").replace(/\n{3,}/g, "\n\n").trim() + "\n";
  }

  await notesService.saveNote(noteId, content);
}

export const ICON_COLORS = [
  { name: "red", value: "#ef4444" },
  { name: "orange", value: "#f97316" },
  { name: "amber", value: "#f59e0b" },
  { name: "green", value: "#22c55e" },
  { name: "cyan", value: "#06b6d4" },
  { name: "blue", value: "#3b82f6" },
  { name: "purple", value: "#8b5cf6" },
  { name: "pink", value: "#ec4899" },
  { name: "stone", value: "#78716c" },
  { name: "slate", value: "#64748b" },
] as const;

export const ICON_SYMBOLS = [
  "📄", "📝", "📚", "📖", "🔗", "🌐",
  "💡", "⭐", "🎯", "💻", "🔬", "📊",
  "🎨", "🎵", "✨", "🔥", "💎", "🌿",
  "📌", "🏷️", "🧠", "⚡", "🔒", "📐",
] as const;

export function parseIconCover(coverUrl: string | null | undefined): { symbol: string; color: string } | null {
  if (!coverUrl?.startsWith("icon:")) return null;
  const parts = coverUrl.slice(5).split(":");
  if (parts.length === 2) {
    return { symbol: parts[0], color: parts[1] };
  }
  if (parts.length === 1) {
    return { symbol: "", color: parts[0] };
  }
  return null;
}

export async function changeNoteType(noteId: string, newType: string) {
  const note = await notesService.readNote(noteId);
  let content = note.content;
  const hasType = TYPE_REGEX.test(content);
  TYPE_REGEX.lastIndex = 0;

  if (hasType) {
    content = content.replace(TYPE_REGEX, `$1#${newType}`);
  } else {
    content = content.trimEnd() + `\n#${newType}\n`;
  }

  await notesService.saveNote(noteId, content);
}

function extractDomain(url: string): string {
  try {
    const { hostname } = new URL(url);
    return hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function faviconUrl(url: string): string {
  try {
    const { origin } = new URL(url);
    return `https://www.google.com/s2/favicons?sz=32&domain_url=${encodeURIComponent(origin)}`;
  } catch {
    return "";
  }
}

function SortableArticleRow({
  note,
  onOpenNote,
  onContextMenu,
}: {
  note: NoteMetadata;
  onOpenNote: (id: string) => void;
  onContextMenu: (e: React.MouseEvent, note: NoteMetadata) => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: note.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  const title = cleanTitle(note.title);
  const link = note.linkUrl;
  const domain = link ? extractDomain(link) : null;
  const favicon = link ? faviconUrl(link) : null;
  const cover = note.coverUrl;
  const iconCover = parseIconCover(cover);
  const isImageCover = cover && !iconCover;

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      role="button"
      tabIndex={0}
      onClick={(e) => {
        if ((e.metaKey || e.ctrlKey) && link) {
          invoke("open_url_safe", { url: link }).catch(() => {});
        } else {
          onOpenNote(note.id);
        }
      }}
      onContextMenu={(e) => onContextMenu(e, note)}
      className="flex items-center gap-3 px-2 py-2.5 -mx-2 rounded-lg text-left hover:bg-bg-muted transition-colors cursor-grab active:cursor-grabbing"
    >
      {iconCover ? (
        <div
          className="w-7 h-7 rounded shrink-0 flex items-center justify-center pointer-events-none"
          style={{ backgroundColor: iconCover.color }}
        >
          {iconCover.symbol && (
            <span className="text-sm leading-none">{iconCover.symbol}</span>
          )}
        </div>
      ) : isImageCover ? (
        <img
          src={cover}
          alt=""
          className="w-7 h-7 rounded object-cover shrink-0 pointer-events-none"
          loading="lazy"
        />
      ) : favicon ? (
        <img
          src={favicon}
          alt=""
          className="w-5 h-5 rounded shrink-0 ml-1 mr-0.5 pointer-events-none"
          loading="lazy"
          onError={(e) => {
            (e.currentTarget as HTMLImageElement).style.display = "none";
          }}
        />
      ) : (
        <div className="w-5 h-5 rounded bg-bg-muted shrink-0 ml-1 mr-0.5" />
      )}
      <span className="text-sm font-medium text-text truncate">
        {title}
      </span>
      {domain && link && (
        <span
          role="link"
          onClick={(e) => {
            e.stopPropagation();
            invoke("open_url_safe", { url: link }).catch(() => {});
          }}
          className="text-xs text-text-muted hover:text-text hover:underline shrink-0 ml-auto cursor-pointer"
        >
          {domain}
        </span>
      )}
    </div>
  );
}

export function ArticleList({ notes, sectionType, onOpenNote, onStatusChange, onChangeIcon, isDragOver }: ArticleListProps) {
  const handleContextMenu = useCallback(
    async (e: React.MouseEvent, note: NoteMetadata) => {
      e.preventDefault();
      const link = note.linkUrl;

      const statusItems = await Submenu.new({
        text: "Move to…",
        items: [
          await MenuItem.new({
            text: "To Read",
            action: async () => {
              await changeNoteStatus(note.id, "to-read");
              onStatusChange?.();
            },
          }),
          await MenuItem.new({
            text: "Reading",
            action: async () => {
              await changeNoteStatus(note.id, "reading");
              onStatusChange?.();
            },
          }),
          await MenuItem.new({
            text: "Read",
            action: async () => {
              await changeNoteStatus(note.id, "have-read");
              onStatusChange?.();
            },
          }),
        ],
      });

      const typeItems = await Submenu.new({
        text: "Change type…",
        items: [
          await MenuItem.new({
            text: "Blog",
            enabled: sectionType !== "blog",
            action: async () => {
              await changeNoteType(note.id, "blog");
              onStatusChange?.();
            },
          }),
          await MenuItem.new({
            text: "Technical",
            enabled: sectionType !== "technical",
            action: async () => {
              await changeNoteType(note.id, "technical");
              onStatusChange?.();
            },
          }),
          await MenuItem.new({
            text: "Link",
            enabled: sectionType !== "link",
            action: async () => {
              await changeNoteType(note.id, "link");
              onStatusChange?.();
            },
          }),
        ],
      });

      const iconItems: MenuItem[] = [];
      const changeIcon = await MenuItem.new({
        text: "Change Icon…",
        action: () => onChangeIcon?.(note.id),
      });
      iconItems.push(changeIcon);
      if (note.coverUrl) {
        const removeIcon = await MenuItem.new({
          text: "Remove Icon",
          action: async () => {
            await changeNoteIcon(note.id, null);
            onStatusChange?.();
          },
        });
        iconItems.push(removeIcon);
      }

      const separator = await PredefinedMenuItem.new({ item: "Separator" });

      const menuItems = [statusItems, typeItems, separator, ...iconItems];

      if (link) {
        const sep2 = await PredefinedMenuItem.new({ item: "Separator" });
        const openLink = await MenuItem.new({
          text: "Open Link in Browser",
          action: () => {
            invoke("open_url_safe", { url: link }).catch(() => {});
          },
        });
        menuItems.push(sep2, openLink);
      }

      const menu = await Menu.new({ items: menuItems });
      await menu.popup();
    },
    [onStatusChange, onChangeIcon, sectionType],
  );

  return (
    <div
      className={`flex flex-col rounded-lg transition-colors ${
        isDragOver ? "bg-bg-muted/60 ring-1 ring-accent/40" : ""
      }`}
    >
      {notes.map((note) => (
        <SortableArticleRow
          key={note.id}
          note={note}
          onOpenNote={onOpenNote}
          onContextMenu={handleContextMenu}
        />
      ))}
      {notes.length === 0 && isDragOver && (
        <div className="px-2 py-3 text-sm text-text-muted text-center">
          Drop here
        </div>
      )}
    </div>
  );
}
