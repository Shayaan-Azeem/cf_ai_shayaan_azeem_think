import { getNoteTagInfo, type NoteType } from "../../lib/note-tags";
import {
  searchNotes as searchNotesService,
  readNote as readNoteService,
} from "../../services/notes";
import type { Note, NoteMetadata } from "../../types/note";
import { buildChatDiff, type ChatDiffResult } from "./chat-diff";

export interface ChatReferenceItem {
  id: string;
  title: string;
  preview: string;
  coverUrl: string | null;
  linkUrl: string | null;
  noteType: NoteType;
  cardKind: "book" | "article" | "note";
  author: string | null;
  publication: string | null;
  publishedAt: string | null;
}

export interface SearchNotesToolOutput {
  matches: ChatReferenceItem[];
}

export interface ReadNoteToolOutput {
  id: string;
  title: string;
  content: string;
  reference: ChatReferenceItem | null;
}

export interface ProposedNoteEditToolOutput {
  proposal: ChatNoteEditProposal;
}

export interface ChatNoteEditProposal {
  noteId: string;
  title: string;
  summary: string | null;
  originalContent: string;
  updatedContent: string;
  diff: ChatDiffResult;
  reference: ChatReferenceItem | null;
}

function extractComment(content: string, key: string): string | null {
  const match = content.match(
    new RegExp(`<!--\\s*${key}:\\s*(.+?)\\s*-->`, "i"),
  );
  return match?.[1]?.trim() || null;
}

function extractLineField(content: string, label: string): string | null {
  const match = content.match(
    new RegExp(`^\\*\\*${label}:\\*\\*\\s*(.+)$`, "im"),
  );
  return match?.[1]?.trim() || null;
}

function extractLinkedField(
  content: string,
  label: string,
): { text: string | null; url: string | null } {
  const match = content.match(
    new RegExp(`^\\*\\*${label}:\\*\\*\\s*\\[([^\\]]+)\\]\\(([^)]+)\\)`, "im"),
  );
  if (!match) return { text: null, url: null };
  return {
    text: match[1]?.trim() || null,
    url: match[2]?.trim() || null,
  };
}

function cleanPreviewText(preview: string): string {
  return preview
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/^\s*<!--.*$/gim, " ")
    .replace(/^\s*.*-->\s*$/gim, " ")
    .replace(/^\s*\*\*(Author|Source|Link|Published):\*\*.*$/gim, " ")
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function getCardKind(noteType: NoteType): ChatReferenceItem["cardKind"] {
  switch (noteType) {
    case "book":
      return "book";
    case "blog":
    case "technical":
    case "link":
      return "article";
    default:
      return "note";
  }
}

function buildReferenceItem(
  searchLike: { id: string; title: string; preview: string },
  metadata?: NoteMetadata,
  note?: Note,
): ChatReferenceItem {
  const content = note?.content ?? "";
  const sourceField = extractLinkedField(content, "Source");
  const linkField = extractLinkedField(content, "Link");
  const noteType = getNoteTagInfo({
    title: metadata?.title ?? searchLike.title,
    preview: metadata?.preview ?? searchLike.preview,
    hashtags: metadata?.hashtags,
  }).type;

  return {
    id: searchLike.id,
    title: metadata?.title ?? searchLike.title,
    preview: cleanPreviewText(metadata?.preview ?? searchLike.preview),
    coverUrl: metadata?.coverUrl ?? extractComment(content, "cover"),
    linkUrl:
      metadata?.linkUrl ??
      extractComment(content, "link") ??
      sourceField.url ??
      linkField.url,
    noteType,
    cardKind: getCardKind(noteType),
    author: extractLineField(content, "Author"),
    publication: sourceField.text,
    publishedAt: extractLineField(content, "Published"),
  };
}

export async function handleSearchNotes(
  query: string,
  notesById: Map<string, NoteMetadata>,
) {
  try {
    const results = await searchNotesService(query);
    const seen = new Set<string>();
    const uniqueResults = results.filter((result) => {
      if (seen.has(result.id)) return false;
      seen.add(result.id);
      return true;
    });
    return {
      matches: uniqueResults.map((result) =>
        buildReferenceItem(result, notesById.get(result.id)),
      ),
    } satisfies SearchNotesToolOutput;
  } catch (err) {
    console.error("[chat-tools] searchNotes failed:", err);
    return { error: "Failed to search notes" };
  }
}

export async function handleReadNote(
  noteId: string,
  notesById: Map<string, NoteMetadata>,
) {
  try {
    const note = await readNoteService(noteId);
    const metadata = notesById.get(note.id);
    return {
      id: note.id,
      title: note.title,
      content: note.content,
      reference: buildReferenceItem(
        {
          id: note.id,
          title: note.title,
          preview: metadata?.preview ?? "",
        },
        metadata,
        note,
      ),
    } satisfies ReadNoteToolOutput;
  } catch (err) {
    console.error("[chat-tools] readNote failed:", err);
    return { error: `Note "${noteId}" not found` };
  }
}

export async function handleProposeNoteEdit(
  input: {
    noteId: string;
    updatedContent: string;
    summary?: string;
  },
  notesById: Map<string, NoteMetadata>,
) {
  try {
    const note = await readNoteService(input.noteId);
    const metadata = notesById.get(note.id);

    return {
      proposal: {
        noteId: note.id,
        title: note.title,
        summary: input.summary?.trim() || null,
        originalContent: note.content,
        updatedContent: input.updatedContent,
        diff: buildChatDiff(note.content, input.updatedContent),
        reference: buildReferenceItem(
          {
            id: note.id,
            title: note.title,
            preview: metadata?.preview ?? "",
          },
          metadata,
          note,
        ),
      },
    } satisfies ProposedNoteEditToolOutput;
  } catch (err) {
    console.error("[chat-tools] proposeNoteEdit failed:", err);
    return { error: `Could not prepare edits for note "${input.noteId}"` };
  }
}
