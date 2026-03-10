import type { NoteMetadata } from "../types/note";

export type NoteStatus = "to-read" | "reading" | "have-read" | "unknown";
export type NoteType =
  | "book"
  | "blog"
  | "technical"
  | "journal"
  | "link"
  | "note"
  | "unknown";

export interface NoteTagInfo {
  hashtags: string[];
  status: NoteStatus;
  type: NoteType;
}

export interface TagSuggestion {
  value: string;
  label: string;
  description: string;
}

export const TAG_SUGGESTIONS: TagSuggestion[] = [
  { value: "book", label: "#book", description: "Book note type" },
  { value: "blog", label: "#blog", description: "Blog post / article" },
  { value: "technical", label: "#technical", description: "Technical article" },
  { value: "journal", label: "#journal", description: "Journal entry" },
  { value: "link", label: "#link", description: "Saved link" },
  { value: "note", label: "#note", description: "General note" },
  { value: "to-read", label: "#to-read", description: "Reading queue" },
  { value: "reading", label: "#reading", description: "Currently reading" },
  { value: "have-read", label: "#have-read", description: "Finished reading" },
];

const STATUS_ALIASES: Record<Exclude<NoteStatus, "unknown">, string[]> = {
  "to-read": ["to-read", "toread", "queue", "upnext", "later"],
  reading: ["reading", "in-progress", "inprogress", "current"],
  "have-read": ["have-read", "haveread", "read", "done", "finished"],
};

const TYPE_ALIASES: Record<Exclude<NoteType, "unknown">, string[]> = {
  book: ["book", "books"],
  blog: ["blog", "substack", "newsletter", "post"],
  technical: ["technical", "tech", "engineering", "tutorial", "docs"],
  journal: ["journal", "journaling", "diary", "log"],
  link: ["link", "links", "bookmark", "twitter", "tweet", "x"],
  note: ["note", "notes", "article", "essay", "paper"],
};

function extractHashtags(input: string): string[] {
  const matches = input.toLowerCase().match(/(?:^|\s)#([a-z0-9][a-z0-9_-]*)/g);
  if (!matches) return [];
  return matches.map((raw) => raw.trim().slice(1));
}

function findStatus(hashtags: string[]): NoteStatus {
  for (const [status, aliases] of Object.entries(STATUS_ALIASES)) {
    if (hashtags.some((tag) => aliases.includes(tag))) {
      return status as NoteStatus;
    }
  }
  return "unknown";
}

function findType(hashtags: string[]): NoteType {
  for (const [noteType, aliases] of Object.entries(TYPE_ALIASES)) {
    if (hashtags.some((tag) => aliases.includes(tag))) {
      return noteType as NoteType;
    }
  }
  return "unknown";
}

export function getNoteTagInfo(
  note: Pick<NoteMetadata, "title" | "preview" | "hashtags">
): NoteTagInfo {
  const hashtags =
    note.hashtags && note.hashtags.length > 0
      ? note.hashtags.map((tag) => tag.toLowerCase())
      : extractHashtags(`${note.title} ${note.preview}`);
  return {
    hashtags,
    status: findStatus(hashtags),
    type: findType(hashtags),
  };
}
