import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  useDroppable,
  type DragStartEvent,
  type DragEndEvent,
  type DragOverEvent,
} from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy, arrayMove } from "@dnd-kit/sortable";
import type { NoteMetadata } from "../../types/note";
import { Bookshelf, createShelfBooks } from "./Bookshelf";
import { ArticleList, changeNoteType, changeNoteIcon, ICON_COLORS } from "./ArticleList";
import { getNoteTagInfo } from "../../lib/note-tags";
import { PlusIcon, SettingsIcon } from "../icons";
import { AddItemModal } from "./AddItemModal";
import { HistoryView } from "./HistoryView";
import { ChatView, ChatDisabledView } from "../chat/ChatView";
import { cleanTitle } from "../../lib/utils";
import type { BookSearchResult } from "../../services/books";
import type { UrlMetadata } from "../../services/urlMetadata";

interface HomePageProps {
  notes: NoteMetadata[];
  onOpenNote: (id: string) => void;
  onCreateNote: (title?: string, tag?: string) => void;
  onCreateBookNote: (book: BookSearchResult) => void;
  onCreateUrlNote: (metadata: UrlMetadata, tag: string) => void;
  onPasteUrl: (url: string, status: string) => void;
  onOpenSettings: () => void;
  onRefresh?: () => void;
  chatWorkerUrl?: string;
}

type SectionId = "to-read" | "have-read" | "writings" | "chat" | "history";

const SIDEBAR_SECTIONS: { id: SectionId; label: string }[] = [
  { id: "to-read", label: "To Read" },
  { id: "have-read", label: "Read" },
  { id: "writings", label: "Writings" },
  { id: "chat", label: "Chat" },
  { id: "history", label: "History" },
];

const TYPE_LABELS: Record<string, string> = {
  book: "Books",
  blog: "Blogs",
  technical: "Technical",
  link: "Links",
  journal: "Journals",
  note: "Notes",
  unknown: "Other",
};

const TYPE_ORDER: string[] = ["book", "blog", "technical", "link", "journal", "note", "unknown"];

interface TypeRow {
  type: string;
  label: string;
  notes: NoteMetadata[];
}

const ARTICLE_TYPES = new Set(["blog", "technical", "link"]);

function DroppableSection({
  type,
  label,
  count,
  isDragOver,
  children,
}: {
  type: string;
  label: string;
  count: number;
  isDragOver: boolean;
  children: React.ReactNode;
}) {
  const { setNodeRef } = useDroppable({ id: `section-${type}` });
  return (
    <section
      ref={setNodeRef}
      className={`space-y-3 rounded-lg transition-all ${
        isDragOver ? "ring-1 ring-accent/40 bg-bg-muted/30 p-3 -m-3" : ""
      }`}
    >
      <div className="flex items-center justify-between">
        <h2 className="text-sm md:text-base font-semibold text-text">
          {label}
        </h2>
        <span className="text-xs text-text-muted">
          {count} {count === 1 ? "item" : "items"}
        </span>
      </div>
      {children}
    </section>
  );
}

function groupByType(notes: NoteMetadata[]): TypeRow[] {
  const buckets = new Map<string, NoteMetadata[]>();
  for (const note of notes) {
    const info = getNoteTagInfo(note);
    const t = info.type;
    if (!buckets.has(t)) buckets.set(t, []);
    buckets.get(t)!.push(note);
  }
  return TYPE_ORDER
    .filter((t) => buckets.has(t))
    .map((t) => ({
      type: t,
      label: TYPE_LABELS[t] || t,
      notes: buckets.get(t)!,
    }));
}

function countByStatus(notes: NoteMetadata[]): Record<string, number> {
  const counts: Record<string, number> = {
    "to-read": 0,
    "have-read": 0,
    writings: 0,
    history: 0,
  };
  for (const note of notes) {
    const info = getNoteTagInfo(note);
    if (info.status === "to-read" || info.status === "reading") counts["to-read"] += 1;
    else if (info.status === "have-read") counts["have-read"] += 1;
    if (info.type === "journal" || info.type === "note" || info.type === "unknown") {
      counts.writings += 1;
    }
  }
  return counts;
}

export function HomePage({
  notes,
  onOpenNote,
  onCreateNote,
  onCreateBookNote,
  onCreateUrlNote,
  onPasteUrl,
  onOpenSettings,
  onRefresh,
  chatWorkerUrl,
}: HomePageProps) {
  const [activeSection, setActiveSection] = useState<SectionId>("to-read");
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [iconEditNoteId, setIconEditNoteId] = useState<string | null>(null);
  const [iconColor, setIconColor] = useState<string>(ICON_COLORS[5].value);
  const [iconUrl, setIconUrl] = useState("");
  const [activeId, setActiveId] = useState<string | null>(null);
  const [overSectionType, setOverSectionType] = useState<string | null>(null);
  const [localOrder, setLocalOrder] = useState<Record<string, string[]>>({});
  const dragSourceRef = useRef<string | null>(null);
  const prevTypeRowsRef = useRef<TypeRow[]>([]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );

  useEffect(() => {
    if (activeSection === "history" || activeSection === "writings") return;
    const handlePaste = (e: ClipboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      const text = e.clipboardData?.getData("text/plain")?.trim();
      if (!text) return;
      try {
        const u = new URL(text);
        if (u.protocol === "http:" || u.protocol === "https:") {
          e.preventDefault();
          onPasteUrl(text, activeSection);
        }
      } catch { /* not a URL */ }
    };
    window.addEventListener("paste", handlePaste);
    return () => window.removeEventListener("paste", handlePaste);
  }, [activeSection, onPasteUrl]);

  const sectionCounts = useMemo(() => countByStatus(notes), [notes]);

  const filteredNotes = useMemo(() => {
    if (activeSection === "history") return [];
    if (activeSection === "writings") {
      return notes.filter((note) => {
        const info = getNoteTagInfo(note);
        return info.type === "journal" || info.type === "note" || info.type === "unknown";
      });
    }
    return notes.filter((note) => {
      const info = getNoteTagInfo(note);
      if (activeSection === "to-read") return info.status === "to-read" || info.status === "reading";
      return info.status === activeSection;
    });
  }, [notes, activeSection]);

  const typeRows = useMemo(() => groupByType(filteredNotes), [filteredNotes]);

  useEffect(() => {
    setLocalOrder((prev) => {
      const next: Record<string, string[]> = {};
      for (const row of typeRows) {
        if (!ARTICLE_TYPES.has(row.type)) continue;
        const noteIds = row.notes.map((n) => n.id);
        const existing = prev[row.type];
        if (!existing) {
          next[row.type] = noteIds;
          continue;
        }
        const noteSet = new Set(noteIds);
        const ordered = existing.filter((id) => noteSet.has(id));
        for (const id of noteIds) {
          if (!ordered.includes(id)) ordered.push(id);
        }
        next[row.type] = ordered;
      }
      return next;
    });
    prevTypeRowsRef.current = typeRows;
  }, [typeRows]);

  const noteMap = useMemo(() => {
    const map = new Map<string, NoteMetadata>();
    for (const note of filteredNotes) map.set(note.id, note);
    return map;
  }, [filteredNotes]);

  const findContainer = useCallback(
    (noteId: string): string | null => {
      for (const [type, ids] of Object.entries(localOrder)) {
        if (ids.includes(noteId)) return type;
      }
      return null;
    },
    [localOrder],
  );

  const activeNote = activeId ? noteMap.get(activeId) : null;

  const handleDragStart = useCallback((event: DragStartEvent) => {
    const id = event.active.id as string;
    setActiveId(id);
    dragSourceRef.current = findContainer(id);
  }, [findContainer]);

  const handleDragOver = useCallback(
    (event: DragOverEvent) => {
      const { active, over } = event;
      if (!over) {
        setOverSectionType(null);
        return;
      }

      const overId = over.id as string;
      let targetType: string | null = null;

      if (overId.startsWith("section-")) {
        targetType = overId.replace("section-", "");
      } else {
        targetType = findContainer(overId);
      }

      const sourceType = findContainer(active.id as string);
      setOverSectionType(targetType !== sourceType ? targetType : null);

      if (!targetType || !sourceType || targetType === sourceType) return;

      setLocalOrder((prev) => {
        const sourceIds = [...(prev[sourceType] || [])];
        const targetIds = [...(prev[targetType!] || [])];
        const activeIdx = sourceIds.indexOf(active.id as string);
        if (activeIdx === -1) return prev;

        sourceIds.splice(activeIdx, 1);

        const overIdx = overId.startsWith("section-")
          ? targetIds.length
          : targetIds.indexOf(overId);
        if (overIdx === -1) {
          targetIds.push(active.id as string);
        } else {
          targetIds.splice(overIdx, 0, active.id as string);
        }

        return { ...prev, [sourceType]: sourceIds, [targetType!]: targetIds };
      });
    },
    [findContainer],
  );

  const handleDragEnd = useCallback(
    async (event: DragEndEvent) => {
      const { active, over } = event;
      const originalSource = dragSourceRef.current;
      setActiveId(null);
      setOverSectionType(null);
      dragSourceRef.current = null;

      if (!over || !originalSource) return;

      const overId = over.id as string;
      const currentContainer = findContainer(active.id as string);
      let targetType: string | null = null;

      if (overId.startsWith("section-")) {
        targetType = overId.replace("section-", "");
      } else {
        targetType = currentContainer;
      }

      if (targetType && targetType !== originalSource) {
        await changeNoteType(active.id as string, targetType);
        onRefresh?.();
        return;
      }

      if (originalSource === currentContainer && !overId.startsWith("section-")) {
        setLocalOrder((prev) => {
          const ids = [...(prev[originalSource] || [])];
          const oldIdx = ids.indexOf(active.id as string);
          const newIdx = ids.indexOf(overId);
          if (oldIdx === -1 || newIdx === -1 || oldIdx === newIdx) return prev;
          return { ...prev, [originalSource]: arrayMove(ids, oldIdx, newIdx) };
        });
      }
    },
    [findContainer, onRefresh],
  );

  const orderedTypeRows = useMemo(() => {
    return typeRows.map((row) => {
      if (!ARTICLE_TYPES.has(row.type)) return row;
      const order = localOrder[row.type];
      if (!order) return row;
      const noteById = new Map(row.notes.map((n) => [n.id, n]));
      const ordered = order.map((id) => noteById.get(id)).filter(Boolean) as NoteMetadata[];
      return { ...row, notes: ordered };
    });
  }, [typeRows, localOrder]);

  return (
    <div className="h-screen w-screen bg-bg overflow-hidden flex">
      <aside className="w-56 h-full bg-bg-secondary border-r border-border flex flex-col shrink-0">
        <div className="h-11" data-tauri-drag-region></div>
        <div className="px-4 pt-2 pb-3 border-b border-border">
          <div className="text-base font-semibold text-text">Library</div>
          <div className="text-xs text-text-muted mt-0.5">Use tags like #book #reading</div>
        </div>
        <div className="flex-1 overflow-y-auto px-2 py-2 space-y-1">
          {SIDEBAR_SECTIONS.map((section) => (
            <button
              key={section.id}
              type="button"
              onClick={() => setActiveSection(section.id)}
              className={`w-full text-left px-2.5 py-2 rounded-md text-sm transition-colors flex items-center justify-between ${
                activeSection === section.id
                  ? "bg-bg-muted text-text"
                  : "text-text-muted hover:text-text hover:bg-bg-muted"
              }`}
            >
              <span>{section.label}</span>
              {section.id !== "chat" && (
                <span className="text-xs opacity-75">{sectionCounts[section.id]}</span>
              )}
            </button>
          ))}
        </div>
      </aside>

      <div className="flex-1 min-w-0 h-full overflow-hidden flex flex-col">
        <div className="h-11 shrink-0" data-tauri-drag-region></div>

        {activeSection === "chat" ? (
          chatWorkerUrl ? (
            <ChatView
              workerUrl={chatWorkerUrl}
              onOpenSettings={onOpenSettings}
              onOpenNote={onOpenNote}
            />
          ) : (
            <ChatDisabledView onOpenSettings={onOpenSettings} />
          )
        ) : activeSection === "history" ? (
          <div className="flex-1 min-h-0 overflow-hidden flex flex-col px-6 pt-0 md:pt-2">
            <div className="flex items-center justify-between gap-3 mb-6 shrink-0">
              <div className="text-lg font-semibold text-text">History</div>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={onOpenSettings}
                  className="h-8 w-8 inline-flex items-center justify-center rounded-md text-text-muted hover:text-text hover:bg-bg-muted transition-colors"
                  aria-label="Settings"
                >
                  <SettingsIcon className="w-4.5 h-4.5" />
                </button>
              </div>
            </div>
            <div className="flex-1 min-h-0 overflow-hidden">
              <HistoryView notes={notes} onOpenNote={onOpenNote} />
            </div>
          </div>
        ) : (
          <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden">
            <div className="px-6 pt-0 pb-8 md:pt-2 md:pb-14">
              <div className="flex flex-wrap items-center justify-between gap-3 mb-8 md:mb-10">
                <div>
                  <div className="text-2xl md:text-3xl font-semibold tracking-tight text-text">
                    {SIDEBAR_SECTIONS.find((s) => s.id === activeSection)?.label}
                  </div>
                  <div className="text-sm text-text-muted mt-1">
                    {sectionCounts[activeSection]} {sectionCounts[activeSection] === 1 ? "item" : "items"}
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={onOpenSettings}
                    className="h-8 w-8 inline-flex items-center justify-center rounded-md text-text-muted hover:text-text hover:bg-bg-muted transition-colors"
                    aria-label="Settings"
                  >
                    <SettingsIcon className="w-4.5 h-4.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setAddModalOpen(true)}
                    className="h-8 w-8 inline-flex items-center justify-center rounded-md text-text-muted hover:text-text hover:bg-bg-muted transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1"
                    aria-label="Add item"
                  >
                    <PlusIcon className="w-4.5 h-4.5" />
                  </button>
                </div>
              </div>

              {orderedTypeRows.length === 0 ? null : (
                <DndContext
                  sensors={sensors}
                  onDragStart={handleDragStart}
                  onDragOver={handleDragOver}
                  onDragEnd={handleDragEnd}
                >
                  <div className="space-y-8">
                    {orderedTypeRows.map((row) =>
                      ARTICLE_TYPES.has(row.type) ? (
                        <DroppableSection
                          key={row.type}
                          type={row.type}
                          label={row.label}
                          count={row.notes.length}
                          isDragOver={overSectionType === row.type}
                        >
                          <SortableContext
                            items={row.notes.map((n) => n.id)}
                            strategy={verticalListSortingStrategy}
                          >
                            <ArticleList
                              notes={row.notes}
                              sectionType={row.type}
                              onOpenNote={onOpenNote}
                              onStatusChange={onRefresh}
                              onChangeIcon={(noteId) => {
                                setIconEditNoteId(noteId);
                                setIconColor(ICON_COLORS[5].value);
                                setIconUrl("");
                              }}
                              isDragOver={overSectionType === row.type && row.notes.length === 0}
                            />
                          </SortableContext>
                        </DroppableSection>
                      ) : (
                        <section key={row.type} className="space-y-3">
                          <div className="flex items-center justify-between">
                            <h2 className="text-sm md:text-base font-semibold text-text">
                              {row.label}
                            </h2>
                            <span className="text-xs text-text-muted">
                              {row.notes.length} {row.notes.length === 1 ? "item" : "items"}
                            </span>
                          </div>
                          <Bookshelf books={createShelfBooks(row.notes)} onOpenBook={onOpenNote} />
                        </section>
                      ),
                    )}
                  </div>
                  <DragOverlay dropAnimation={null}>
                    {activeNote ? (
                      <div className="flex items-center gap-3 px-2 py-2.5 rounded-lg bg-bg shadow-lg border border-border opacity-90">
                        <span className="text-sm font-medium text-text truncate">
                          {cleanTitle(activeNote.title)}
                        </span>
                      </div>
                    ) : null}
                  </DragOverlay>
                </DndContext>
              )}
            </div>
          </div>
        )}
      </div>

      {addModalOpen && (
        <div
          className="fixed inset-0 bg-black/50 backdrop-blur-sm z-40"
          onClick={() => setAddModalOpen(false)}
        />
      )}
      <AddItemModal
        open={addModalOpen}
        onClose={() => setAddModalOpen(false)}
        onAddBook={(book) => {
          setAddModalOpen(false);
          onCreateBookNote(book);
        }}
        onAddUrl={(metadata, tag) => {
          setAddModalOpen(false);
          onCreateUrlNote(metadata, tag);
        }}
        onAddNote={(title, tag) => {
          setAddModalOpen(false);
          onCreateNote(title, tag);
        }}
      />

      {iconEditNoteId && (
        <>
          <div
            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50"
            onClick={() => setIconEditNoteId(null)}
          />
          <div className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-72 bg-bg border border-border rounded-xl shadow-xl p-4">
            <div className="text-sm font-medium text-text mb-4">Change Icon</div>

            <div className="text-xs text-text-muted mb-2">Color</div>
            <div className="flex items-center gap-3 mb-4">
              <input
                type="color"
                value={iconColor}
                onChange={(e) => setIconColor(e.target.value)}
                className="w-10 h-10 rounded-lg border border-border cursor-pointer bg-transparent p-0 [&::-webkit-color-swatch-wrapper]:p-0 [&::-webkit-color-swatch]:rounded-lg [&::-webkit-color-swatch]:border-none"
              />
              <div className="flex flex-wrap gap-1.5">
                {ICON_COLORS.map((c) => (
                  <button
                    key={c.name}
                    type="button"
                    onClick={() => setIconColor(c.value)}
                    className={`w-5 h-5 rounded-full transition-all ${
                      iconColor === c.value
                        ? "ring-2 ring-accent ring-offset-1 ring-offset-bg scale-110"
                        : "hover:scale-110"
                    }`}
                    style={{ backgroundColor: c.value }}
                    aria-label={c.name}
                  />
                ))}
              </div>
            </div>

            <div className="text-xs text-text-muted mb-2">Or paste image URL</div>
            <input
              type="url"
              value={iconUrl}
              onChange={(e) => setIconUrl(e.target.value)}
              placeholder="https://..."
              className="w-full bg-bg-secondary border border-border rounded-lg px-3 py-2 text-sm text-text placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-accent mb-4"
            />

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setIconEditNoteId(null)}
                className="px-3 py-1.5 text-xs rounded-md text-text-muted hover:text-text hover:bg-bg-muted transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={async () => {
                  const url = iconUrl.trim();
                  const value = url || `icon::${iconColor}`;
                  await changeNoteIcon(iconEditNoteId, value);
                  setIconEditNoteId(null);
                  onRefresh?.();
                }}
                className="px-3 py-1.5 text-xs rounded-md bg-accent text-white hover:opacity-90 transition-opacity"
              >
                Save
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
