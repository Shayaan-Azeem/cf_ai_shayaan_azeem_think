import { useEffect, useMemo, useState, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { NoteIcon } from "../icons";
import type { NoteMetadata } from "../../types/note";

interface EditEntry {
  noteId: string;
  title: string;
  timestamp: number;
  insertions: number;
  deletions: number;
}

interface HistoryViewProps {
  notes: NoteMetadata[];
  onOpenNote: (id: string) => void;
}

interface TimeGroup {
  label: string;
  entries: EditEntry[];
}

function groupByTime(entries: EditEntry[]): TimeGroup[] {
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const yesterdayStart = new Date(todayStart);
  yesterdayStart.setDate(yesterdayStart.getDate() - 1);

  const weekStart = new Date(todayStart);
  weekStart.setDate(weekStart.getDate() - 7);

  const buckets: Record<string, EditEntry[]> = {
    Today: [],
    Yesterday: [],
    "This week": [],
    Older: [],
  };

  for (const entry of entries) {
    const ts = entry.timestamp * 1000;
    if (ts >= todayStart.getTime()) {
      buckets.Today.push(entry);
    } else if (ts >= yesterdayStart.getTime()) {
      buckets.Yesterday.push(entry);
    } else if (ts >= weekStart.getTime()) {
      buckets["This week"].push(entry);
    } else {
      buckets.Older.push(entry);
    }
  }

  return Object.entries(buckets)
    .filter(([, items]) => items.length > 0)
    .map(([label, items]) => ({ label, entries: items }));
}

function formatTime(ts: number): string {
  const d = new Date(ts * 1000);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHrs = Math.floor(diffMin / 60);
  if (diffHrs < 24) return `${diffHrs}h ago`;
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export function HistoryView({ notes, onOpenNote }: HistoryViewProps) {
  const [entries, setEntries] = useState<EditEntry[]>([]);

  const coverMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const note of notes) {
      if (note.coverUrl) map.set(note.id, note.coverUrl);
    }
    return map;
  }, [notes]);

  const fetchHistory = useCallback(async () => {
    try {
      const data: EditEntry[] = await invoke("get_edit_history");
      setEntries(data);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    void fetchHistory();
    const interval = setInterval(() => void fetchHistory(), 5000);
    return () => clearInterval(interval);
  }, [fetchHistory]);

  const groups = useMemo(() => groupByTime(entries), [entries]);

  return (
    <div className="flex flex-col w-full h-full min-h-0">
      <div className="flex-1 min-h-0 overflow-y-auto px-1">
        {groups.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="text-base font-medium text-text mb-1">No activity yet</div>
            <div className="text-sm text-text-muted">
              Edits you make to notes will show up here.
            </div>
          </div>
        ) : (
          <div className="space-y-6">
            {groups.map((group) => (
              <div key={group.label}>
                <div className="text-xs font-medium text-text-muted/70 uppercase tracking-wider px-2 mb-2">
                  {group.label}
                </div>
                <div className="space-y-0.5">
                  {group.entries.map((entry, i) => (
                    <div
                      key={`${entry.noteId}-${entry.timestamp}-${i}`}
                      className="group flex items-center gap-3 px-2 py-2.5 rounded-lg hover:bg-bg-muted transition-colors cursor-pointer"
                      onClick={() => onOpenNote(entry.noteId)}
                    >
                      {coverMap.get(entry.noteId) ? (
                        <img
                          src={coverMap.get(entry.noteId)}
                          alt=""
                          className="w-6 h-6 rounded object-cover shrink-0"
                          loading="lazy"
                        />
                      ) : (
                        <div className="w-5 h-5 rounded bg-bg-muted shrink-0 flex items-center justify-center">
                          <NoteIcon className="w-3 h-3 text-text-muted" />
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium text-text truncate">
                          {entry.title}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {entry.insertions > 0 && (
                          <span className="text-xs font-mono text-green-600/80">
                            +{entry.insertions}
                          </span>
                        )}
                        {entry.deletions > 0 && (
                          <span className="text-xs font-mono text-red-500/70">
                            -{entry.deletions}
                          </span>
                        )}
                        <span className="text-xs text-text-muted/60">
                          {formatTime(entry.timestamp)}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
