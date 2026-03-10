import { useMemo, useState } from "react";
import { SpinnerIcon } from "../icons";
import { cleanTitle } from "../../lib/utils";
import type { ChatNoteEditProposal } from "./chat-tools";
import { ChatReferenceCard } from "./ChatReferenceCard";

interface ChatDiffCardProps {
  proposal: ChatNoteEditProposal;
  onApply: (proposal: ChatNoteEditProposal) => Promise<void>;
  onOpenNote: (id: string) => void;
}

export function ChatDiffCard({
  proposal,
  onApply,
  onOpenNote,
}: ChatDiffCardProps) {
  const [status, setStatus] = useState<"idle" | "applying" | "applied" | "dismissed">(
    "idle",
  );
  const changedLines = useMemo(
    () => proposal.diff.lines.filter((line) => line.type !== "context"),
    [proposal.diff.lines],
  );

  if (status === "dismissed") return null;

  const hasChanges =
    proposal.diff.additions > 0 || proposal.diff.deletions > 0;

  return (
    <div className="rounded-2xl border border-border bg-bg-secondary/70 overflow-hidden">
      <div className="border-b border-border px-4 py-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-[11px] font-medium uppercase tracking-wide text-text-muted">
              Edit proposal
            </div>
            <div className="mt-1 text-sm font-semibold text-text">
              {cleanTitle(proposal.title)}
            </div>
            {proposal.summary ? (
              <div className="mt-1 text-xs leading-5 text-text-muted">
                {proposal.summary}
              </div>
            ) : null}
          </div>
          <div className="shrink-0 text-right text-xs">
            <div className="text-green-600/90">+{proposal.diff.additions}</div>
            <div className="text-red-500/80">-{proposal.diff.deletions}</div>
          </div>
        </div>
      </div>

      {proposal.reference ? (
        <div className="border-b border-border px-3 py-3">
          <ChatReferenceCard
            reference={proposal.reference}
            onOpenNote={onOpenNote}
          />
        </div>
      ) : null}

      <div className="max-h-80 overflow-y-auto bg-bg px-3 py-2 font-mono text-[12px] leading-5">
        {hasChanges ? (
          changedLines.map((line, index) => (
            <div
              key={`${proposal.noteId}-${index}`}
              className={
                line.type === "add"
                  ? "bg-green-500/10 text-green-700 dark:text-green-300"
                  : "bg-red-500/10 text-red-700 dark:text-red-300"
              }
            >
              <div className="grid grid-cols-[42px_42px_12px_minmax(0,1fr)] items-start gap-2 px-2 py-0.5">
                <span className="select-none text-text-muted/60">
                  {line.oldLineNumber ?? ""}
                </span>
                <span className="select-none text-text-muted/60">
                  {line.newLineNumber ?? ""}
                </span>
                <span>{line.type === "add" ? "+" : "-"}</span>
                <span className="whitespace-pre-wrap break-words">
                  {line.content || " "}
                </span>
              </div>
            </div>
          ))
        ) : (
          <div className="px-2 py-3 text-xs italic text-text-muted">
            No textual changes were proposed.
          </div>
        )}
      </div>

      <div className="flex items-center justify-between gap-3 border-t border-border px-4 py-3">
        <button
          type="button"
          onClick={() => onOpenNote(proposal.noteId)}
          className="text-xs text-text-muted hover:text-text transition-colors"
        >
          Open note
        </button>

        <div className="flex items-center gap-2">
          {status === "applied" ? (
            <span className="text-xs font-medium text-green-600/90">
              Applied
            </span>
          ) : null}

          <button
            type="button"
            onClick={() => setStatus("dismissed")}
            className="rounded-md px-2.5 py-1 text-xs text-text-muted hover:bg-bg hover:text-text transition-colors"
            disabled={status === "applying"}
          >
            Dismiss
          </button>

          <button
            type="button"
            onClick={async () => {
              if (status === "applying" || status === "applied") return;
              setStatus("applying");
              try {
                await onApply(proposal);
                setStatus("applied");
              } catch (error) {
                console.error("[chat] Failed to apply proposed edit:", error);
                setStatus("idle");
              }
            }}
            disabled={status === "applying" || status === "applied"}
            className="inline-flex items-center gap-1 rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-white hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            {status === "applying" ? (
              <>
                <SpinnerIcon className="h-3.5 w-3.5 animate-spin" />
                Applying
              </>
            ) : status === "applied" ? (
              "Applied"
            ) : (
              "Apply changes"
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
