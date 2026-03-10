import { useAgent } from "agents/react";
import { useAgentChat } from "@cloudflare/ai-chat/react";
import {
  Component,
  type JSX,
  type ErrorInfo,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useNotesActions, useNotesData } from "../../context/NotesContext";
import { ChatThreadList } from "./ChatThreadList";
import {
  loadThreads,
  createThread,
  deleteThread,
  updateThreadTitle,
  touchThread,
  type ChatThread,
} from "./thread-store";
import { ArrowUpIcon, SettingsIcon } from "../icons";
import { ChatDiffCard } from "./ChatDiffCard";
import { ChatMarkdown } from "./ChatMarkdown";
import { ChatReferenceCard } from "./ChatReferenceCard";
import {
  handleProposeNoteEdit,
  handleReadNote,
  handleSearchNotes,
  type ChatNoteEditProposal,
  type ProposedNoteEditToolOutput,
  type ReadNoteToolOutput,
  type SearchNotesToolOutput,
} from "./chat-tools";

interface ChatViewProps {
  workerUrl: string;
  onOpenSettings: () => void;
  onOpenNote: (id: string) => void;
}

function normalizeWorkerHost(workerUrl: string): string {
  try {
    return new URL(workerUrl).host;
  } catch {
    return workerUrl
      .replace(/^https?:\/\//, "")
      .replace(/^wss?:\/\//, "")
      .replace(/\/.*$/, "")
      .trim();
  }
}

function getToolStatusLabel(
  toolName: string,
  state: string,
): string | null {
  if (state === "output-error") {
    return "That lookup failed.";
  }

  if (state === "input-streaming" || state === "input-available") {
    if (toolName === "searchNotes") return "Searching notes...";
    if (toolName === "readNote") return "Reading note...";
    if (toolName === "proposeNoteEdit") return "Preparing edit proposal...";
    return `Running ${toolName}...`;
  }

  return null;
}

function getToolError(output: unknown): string | null {
  if (
    output &&
    typeof output === "object" &&
    "error" in output &&
    typeof output.error === "string"
  ) {
    return output.error;
  }
  return null;
}

function isSearchNotesOutput(output: unknown): output is SearchNotesToolOutput {
  return (
    !!output &&
    typeof output === "object" &&
    "matches" in output &&
    Array.isArray(output.matches)
  );
}

function isReadNoteOutput(output: unknown): output is ReadNoteToolOutput {
  return (
    !!output &&
    typeof output === "object" &&
    "content" in output &&
    "title" in output
  );
}

function isProposedNoteEditOutput(
  output: unknown,
): output is ProposedNoteEditToolOutput {
  return (
    !!output &&
    typeof output === "object" &&
    "proposal" in output &&
    !!output.proposal &&
    typeof output.proposal === "object"
  );
}

function isToolPartType(type: string): boolean {
  return type === "dynamic-tool" || type.startsWith("tool-");
}

function getPartToolName(part: {
  type: string;
  toolName?: string;
}): string | null {
  if (part.toolName) return part.toolName;
  if (part.type.startsWith("tool-")) {
    return part.type.slice("tool-".length);
  }
  return null;
}

function ToolPartContent({
  part,
  onOpenNote,
  onApplyEdit,
}: {
  part: {
    toolCallId?: string;
    toolName: string;
    state: string;
    output?: unknown;
    errorText?: string;
  };
  onOpenNote: (id: string) => void;
  onApplyEdit: (proposal: ChatNoteEditProposal) => Promise<void>;
}) {
  if (part.state === "output-available") {
    if (part.toolName === "searchNotes") {
      const error = getToolError(part.output);
      if (error) {
        return (
          <div className="text-xs text-red-500/80">{error}</div>
        );
      }

      const matches = isSearchNotesOutput(part.output)
        ? part.output.matches
        : [];
      if (matches.length === 0) {
        return (
          <div className="text-xs italic text-text-muted">
            No matching notes found.
          </div>
        );
      }

      return (
        <div className="space-y-2">
          {matches.slice(0, 4).map((reference: SearchNotesToolOutput["matches"][number]) => (
            <ChatReferenceCard
              key={`${part.toolName}-${reference.id}`}
              reference={reference}
              onOpenNote={onOpenNote}
            />
          ))}
          {matches.length > 4 ? (
            <div className="text-xs text-text-muted">
              +{matches.length - 4} more matches
            </div>
          ) : null}
        </div>
      );
    }

    if (part.toolName === "readNote") {
      const error = getToolError(part.output);
      if (error) {
        return (
          <div className="text-xs text-red-500/80">{error}</div>
        );
      }

      return isReadNoteOutput(part.output) && part.output.reference ? (
        <ChatReferenceCard
          reference={part.output.reference}
          onOpenNote={onOpenNote}
        />
      ) : null;
    }

    if (part.toolName === "proposeNoteEdit") {
      const error = getToolError(part.output);
      if (error) {
        return <div className="text-xs text-red-500/80">{error}</div>;
      }

      return isProposedNoteEditOutput(part.output) ? (
        <ChatDiffCard
          proposal={part.output.proposal}
          onApply={onApplyEdit}
          onOpenNote={onOpenNote}
        />
      ) : null;
    }
  }

  if (part.state === "output-error") {
    return (
      <div className="text-xs text-red-500/80">
        {part.errorText || "That lookup failed."}
      </div>
    );
  }

  const statusLabel = getToolStatusLabel(part.toolName, part.state);
  if (!statusLabel) return null;

  return (
    <div className="inline-flex rounded-full bg-bg-muted/60 px-3 py-1 text-[11px] italic text-text-muted/70">
      {statusLabel}
    </div>
  );
}

function MessageContent({
  message,
  onOpenNote,
  onApplyEdit,
}: {
  message: {
    id: string;
    role: string;
    parts: Array<{
      type: string;
      text?: string;
      toolCallId?: string;
      toolName?: string;
      state?: string;
      output?: unknown;
      errorText?: string;
    }>;
  };
  onOpenNote: (id: string) => void;
  onApplyEdit: (proposal: ChatNoteEditProposal) => Promise<void>;
}) {
  if (message.role === "user") {
    const text = message.parts
      .filter((part) => part.type === "text" && part.text?.trim())
      .map((part) => part.text)
      .join("");

    if (!text) return null;

    return (
      <div className="flex justify-end">
        <div className="max-w-[80%] rounded-2xl rounded-br-md bg-accent px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap text-white">
          {text}
        </div>
      </div>
    );
  }

  const renderedParts: JSX.Element[] = [];
  const seenReferenceIds = new Set<string>();

  for (let index = 0; index < message.parts.length; index += 1) {
    const part = message.parts[index];

    if (part.type === "text" && part.text?.trim()) {
      renderedParts.push(
        <div key={`${message.id}-text-${index}`} className="max-w-2xl">
          <ChatMarkdown content={part.text} />
        </div>,
      );
      continue;
    }

    if (
      isToolPartType(part.type) &&
      getPartToolName(part) &&
      part.state
    ) {
      const toolName = getPartToolName(part)!;
      let output = part.output;

      if (toolName === "searchNotes" && isSearchNotesOutput(output)) {
        const uniqueMatches = output.matches.filter((reference) => {
          if (seenReferenceIds.has(reference.id)) return false;
          seenReferenceIds.add(reference.id);
          return true;
        });
        output = { ...output, matches: uniqueMatches };
      }

      if (toolName === "readNote" && isReadNoteOutput(output) && output.reference) {
        if (seenReferenceIds.has(output.reference.id)) {
          continue;
        }
        seenReferenceIds.add(output.reference.id);
      }

      if (
        toolName === "proposeNoteEdit" &&
        isProposedNoteEditOutput(output) &&
        output.proposal.reference
      ) {
        if (seenReferenceIds.has(output.proposal.reference.id)) {
          output = {
            ...output,
            proposal: { ...output.proposal, reference: null },
          };
        } else {
          seenReferenceIds.add(output.proposal.reference.id);
        }
      }

      renderedParts.push(
        <div key={`${message.id}-tool-${toolName}-${index}`} className="max-w-2xl">
          <ToolPartContent
            part={{
              toolCallId: part.toolCallId,
              toolName,
              state: part.state,
              output,
              errorText: part.errorText,
            }}
            onOpenNote={onOpenNote}
            onApplyEdit={onApplyEdit}
          />
        </div>,
      );
    }
  }

  if (renderedParts.length === 0) return null;

  return <div className="space-y-3">{renderedParts}</div>;
}

export function ChatView({
  workerUrl,
  onOpenSettings,
  onOpenNote,
}: ChatViewProps) {
  const [threads, setThreads] = useState<ChatThread[]>(() => loadThreads());
  const [activeThreadId, setActiveThreadId] = useState<string | null>(
    () => threads[0]?.id ?? null,
  );
  const firstMessageSent = useRef(false);

  const refreshThreads = useCallback(() => {
    setThreads(loadThreads());
  }, []);

  const handleNewThread = useCallback(() => {
    const thread = createThread();
    firstMessageSent.current = false;
    setActiveThreadId(thread.id);
    refreshThreads();
  }, [refreshThreads]);

  const handleSelectThread = useCallback(
    (id: string) => {
      firstMessageSent.current = true;
      setActiveThreadId(id);
      refreshThreads();
    },
    [refreshThreads],
  );

  const handleDeleteThread = useCallback(
    (id: string) => {
      deleteThread(id);
      const updated = loadThreads();
      setThreads(updated);
      if (activeThreadId === id) {
        setActiveThreadId(updated[0]?.id ?? null);
      }
    },
    [activeThreadId],
  );

  if (!activeThreadId) {
    return (
      <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
        <div className="flex items-center justify-between gap-3 px-6 pt-2 pb-3 border-b border-border shrink-0">
          <div className="text-lg font-semibold text-text">Chat</div>
          <button
            type="button"
            onClick={onOpenSettings}
            className="h-8 w-8 inline-flex items-center justify-center rounded-md text-text-muted hover:text-text hover:bg-bg-muted transition-colors"
            aria-label="Settings"
          >
            <SettingsIcon className="w-4.5 h-4.5" />
          </button>
        </div>
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <div className="text-3xl mb-3 opacity-60">💬</div>
            <div className="text-sm font-medium text-text mb-2">
              Chat with your notes
            </div>
            <div className="text-xs text-text-muted max-w-56 mx-auto mb-4">
              Ask questions about your writings and reading notes. The AI will
              use your library as context.
            </div>
            <button
              type="button"
              onClick={handleNewThread}
              className="px-4 py-2 rounded-xl bg-accent text-white text-sm font-medium hover:opacity-90 transition-opacity"
            >
              Start a conversation
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 min-h-0 overflow-hidden flex">
      <div className="w-48 border-r border-border shrink-0 bg-bg">
        <ChatThreadList
          threads={threads}
          activeThreadId={activeThreadId}
          onSelectThread={handleSelectThread}
          onNewThread={handleNewThread}
          onDeleteThread={handleDeleteThread}
        />
      </div>
      <div className="flex-1 min-w-0 flex flex-col">
        <ChatErrorBoundary onOpenSettings={onOpenSettings}>
          <ChatThread
            workerUrl={workerUrl}
            threadId={activeThreadId}
            onFirstMessage={(text) => {
              if (!firstMessageSent.current) {
                firstMessageSent.current = true;
                const title =
                  text.length > 50 ? text.slice(0, 50) + "..." : text;
                updateThreadTitle(activeThreadId, title);
                refreshThreads();
              }
              touchThread(activeThreadId);
              refreshThreads();
            }}
            onOpenSettings={onOpenSettings}
            onOpenNote={onOpenNote}
          />
        </ChatErrorBoundary>
      </div>
    </div>
  );
}

class ChatErrorBoundary extends Component<
  { children: ReactNode; onOpenSettings: () => void },
  { hasError: boolean }
> {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: unknown, errorInfo: ErrorInfo) {
    console.error("[chat] Failed to render chat thread", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
          <div className="flex items-center justify-between gap-3 px-6 pt-2 pb-3 border-b border-border shrink-0">
            <div className="text-lg font-semibold text-text">Chat</div>
            <button
              type="button"
              onClick={this.props.onOpenSettings}
              className="h-8 w-8 inline-flex items-center justify-center rounded-md text-text-muted hover:text-text hover:bg-bg-muted transition-colors"
              aria-label="Settings"
            >
              <SettingsIcon className="w-4.5 h-4.5" />
            </button>
          </div>
          <div className="flex-1 flex items-center justify-center px-6">
            <div className="text-center max-w-sm">
              <div className="text-sm font-medium text-text mb-2">
                Could not open this chat
              </div>
              <div className="text-xs text-text-muted mb-4">
                Check that the Cloudflare Worker URL is valid and deployed, then
                try again.
              </div>
              <button
                type="button"
                onClick={this.props.onOpenSettings}
                className="px-4 py-2 rounded-xl bg-accent text-white text-sm font-medium hover:opacity-90 transition-opacity"
              >
                Open Settings
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

function ChatThread({
  workerUrl,
  threadId,
  onFirstMessage,
  onOpenSettings,
  onOpenNote,
}: {
  workerUrl: string;
  threadId: string;
  onFirstMessage: (text: string) => void;
  onOpenSettings: () => void;
  onOpenNote: (id: string) => void;
}) {
  const { notes } = useNotesData();
  const { saveNote } = useNotesActions();
  const normalizedWorkerHost = normalizeWorkerHost(workerUrl);
  const notesById = useMemo(
    () => new Map(notes.map((note) => [note.id, note])),
    [notes],
  );
  const agent = useAgent({
    agent: "ChatAgent",
    host: normalizedWorkerHost,
    name: threadId,
  });
  const { messages, sendMessage, clearHistory, status } = useAgentChat({
    agent,
    onToolCall: async ({ toolCall, addToolOutput }) => {
      if (toolCall.toolName === "searchNotes") {
        const input = toolCall.input as { query?: string };
        const results = await handleSearchNotes(input.query ?? "", notesById);
        addToolOutput({ toolCallId: toolCall.toolCallId, output: results });
        return;
      }

      if (toolCall.toolName === "readNote") {
        const input = toolCall.input as { noteId?: string };
        const note = await handleReadNote(input.noteId ?? "", notesById);
        addToolOutput({ toolCallId: toolCall.toolCallId, output: note });
        return;
      }

      if (toolCall.toolName === "proposeNoteEdit") {
        const input = toolCall.input as {
          noteId?: string;
          updatedContent?: string;
          summary?: string;
        };
        const proposal = await handleProposeNoteEdit(
          {
            noteId: input.noteId ?? "",
            updatedContent: input.updatedContent ?? "",
            summary: input.summary,
          },
          notesById,
        );
        addToolOutput({
          toolCallId: toolCall.toolCallId,
          output: proposal,
        });
      }
    },
  });
  const [input, setInput] = useState("");
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, status, threadId]);

  const handleApplyEdit = useCallback(
    async (proposal: ChatNoteEditProposal) => {
      await saveNote(proposal.updatedContent, proposal.noteId);
      onOpenNote(proposal.noteId);
    },
    [onOpenNote, saveNote],
  );

  const handleSend = useCallback(async () => {
    const text = input.trim();
    if (!text || status === "streaming" || status === "submitted") return;

    onFirstMessage(text);
    await sendMessage({ text });
    setInput("");
  }, [input, onFirstMessage, sendMessage, status]);

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between gap-3 px-5 pt-2 pb-2 border-b border-border shrink-0">
        <div className="text-sm font-semibold text-text">Chat</div>
        <div className="flex items-center gap-1">
          {messages.length > 0 && (
            <button
              type="button"
              onClick={clearHistory}
              className="px-2 py-1 text-xs rounded-md text-text-muted hover:text-text hover:bg-bg-muted transition-colors"
            >
              Clear
            </button>
          )}
          <button
            type="button"
            onClick={onOpenSettings}
            className="h-7 w-7 inline-flex items-center justify-center rounded-md text-text-muted hover:text-text hover:bg-bg-muted transition-colors"
            aria-label="Settings"
          >
            <SettingsIcon className="w-4 h-4" />
          </button>
        </div>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto px-6 py-4">
        {messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center">
            <div className="text-3xl mb-3 opacity-60">💬</div>
            <div className="text-sm font-medium text-text mb-1">
              Chat with your notes
            </div>
            <div className="text-xs text-text-muted max-w-56">
              Ask questions about your writings and reading notes. The AI will
              search your library for context.
            </div>
          </div>
        ) : (
          <div className="space-y-4 max-w-2xl mx-auto">
            {messages.map((message) => (
              <div key={message.id} className="space-y-1.5">
                <MessageContent
                  message={message}
                  onOpenNote={onOpenNote}
                  onApplyEdit={handleApplyEdit}
                />
              </div>
            ))}
            {(status === "streaming" || status === "submitted") && (
              <div className="flex justify-start">
                <div className="flex gap-1 px-1 py-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-text-muted animate-bounce [animation-delay:0ms]" />
                  <div className="w-1.5 h-1.5 rounded-full bg-text-muted animate-bounce [animation-delay:150ms]" />
                  <div className="w-1.5 h-1.5 rounded-full bg-text-muted animate-bounce [animation-delay:300ms]" />
                </div>
              </div>
            )}
            <div ref={chatEndRef} />
          </div>
        )}
      </div>

      <div className="shrink-0 px-6 pb-4 pt-2">
      <div className="max-w-2xl mx-auto flex gap-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void handleSend();
              }
            }}
            placeholder="Ask about your notes..."
            className="flex-1 bg-bg-secondary border border-border rounded-xl px-4 py-2.5 text-sm text-text placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-accent resize-none min-h-[44px] max-h-32"
            rows={1}
          />
          <button
            type="button"
            onClick={() => void handleSend()}
            disabled={
              !input.trim() ||
              status === "streaming" ||
              status === "submitted"
            }
            className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-accent text-white hover:opacity-90 transition-opacity disabled:opacity-40"
            aria-label="Send message"
          >
            <ArrowUpIcon className="w-4 h-4 stroke-[2]" />
          </button>
        </div>
      </div>
    </div>
  );
}

function ChatDisabledView({ onOpenSettings }: { onOpenSettings: () => void }) {
  return (
    <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
      <div className="flex items-center justify-between gap-3 px-6 pt-2 pb-3 border-b border-border shrink-0">
        <div className="text-lg font-semibold text-text">Chat</div>
        <button
          type="button"
          onClick={onOpenSettings}
          className="h-8 w-8 inline-flex items-center justify-center rounded-md text-text-muted hover:text-text hover:bg-bg-muted transition-colors"
          aria-label="Settings"
        >
          <SettingsIcon className="w-4.5 h-4.5" />
        </button>
      </div>
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center max-w-xs">
          <div className="text-3xl mb-3 opacity-60">🔗</div>
          <div className="text-sm font-medium text-text mb-2">
            Connect to Cloudflare
          </div>
          <div className="text-xs text-text-muted mb-4">
            Deploy the chat agent worker and add the URL in Settings to enable
            AI chat with your notes.
          </div>
          <button
            type="button"
            onClick={onOpenSettings}
            className="px-4 py-2 rounded-xl bg-accent text-white text-sm font-medium hover:opacity-90 transition-opacity"
          >
            Open Settings
          </button>
        </div>
      </div>
    </div>
  );
}

export { ChatDisabledView };
