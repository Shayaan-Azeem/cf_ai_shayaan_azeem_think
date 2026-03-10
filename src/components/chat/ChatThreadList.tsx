import { useCallback } from "react";
import { PlusIcon, TrashIcon } from "../icons";
import type { ChatThread } from "./thread-store";

interface ChatThreadListProps {
  threads: ChatThread[];
  activeThreadId: string | null;
  onSelectThread: (id: string) => void;
  onNewThread: () => void;
  onDeleteThread: (id: string) => void;
}

function formatTime(ts: number): string {
  const now = Date.now();
  const diff = now - ts;
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(ts).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

export function ChatThreadList({
  threads,
  activeThreadId,
  onSelectThread,
  onNewThread,
  onDeleteThread,
}: ChatThreadListProps) {
  const handleDelete = useCallback(
    (e: React.MouseEvent, id: string) => {
      e.stopPropagation();
      onDeleteThread(id);
    },
    [onDeleteThread],
  );

  return (
    <div className="flex flex-col h-full">
      <div className="px-3 py-2.5 border-b border-border flex items-center justify-between">
        <span className="text-xs font-medium text-text-muted uppercase tracking-wide">
          Threads
        </span>
        <button
          type="button"
          onClick={onNewThread}
          className="h-6 w-6 inline-flex items-center justify-center rounded-md text-text-muted hover:text-text hover:bg-bg-muted transition-colors"
          aria-label="New chat"
        >
          <PlusIcon className="w-3.5 h-3.5" />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto px-1.5 py-1.5 space-y-0.5">
        {threads.length === 0 ? (
          <div className="px-2 py-6 text-center">
            <div className="text-xs text-text-muted">No conversations yet</div>
          </div>
        ) : (
          threads.map((thread) => (
            <div
              key={thread.id}
              onClick={() => onSelectThread(thread.id)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onSelectThread(thread.id);
                }
              }}
              role="button"
              tabIndex={0}
              className={`group w-full text-left px-2.5 py-2 rounded-md text-sm transition-colors flex items-center gap-2 ${
                activeThreadId === thread.id
                  ? "bg-bg-muted text-text"
                  : "text-text-muted hover:text-text hover:bg-bg-muted/50"
              }`}
            >
              <div className="flex-1 min-w-0">
                <div className="truncate text-[13px] leading-tight">
                  {thread.title}
                </div>
                <div className="text-[10px] text-text-muted/70 mt-0.5">
                  {formatTime(thread.updatedAt)}
                </div>
              </div>
              <button
                type="button"
                onClick={(e) => handleDelete(e, thread.id)}
                className="opacity-0 group-hover:opacity-100 h-5 w-5 inline-flex items-center justify-center rounded text-text-muted hover:text-red-500 transition-all shrink-0"
                aria-label="Delete thread"
              >
                <TrashIcon className="w-3 h-3" />
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
