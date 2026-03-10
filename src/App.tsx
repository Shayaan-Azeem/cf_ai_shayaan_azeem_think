import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { toast } from "sonner";
import { NotesProvider, useNotes } from "./context/NotesContext";
import { ThemeProvider, useTheme } from "./context/ThemeContext";
import { GitProvider } from "./context/GitContext";
import { TooltipProvider, Toaster } from "./components/ui";
import { Sidebar } from "./components/layout/Sidebar";
import { Editor } from "./components/editor/Editor";
import type { Editor as TiptapEditor } from "@tiptap/react";
import { FolderPicker } from "./components/layout/FolderPicker";
import { CommandPalette } from "./components/command-palette/CommandPalette";
import { SettingsPage } from "./components/settings";
import {
  SpinnerIcon,
  ClaudeIcon,
  CodexIcon,
  OllamaIcon,
} from "./components/icons";
import { AiEditModal } from "./components/ai/AiEditModal";
import { AiResponseToast } from "./components/ai/AiResponseToast";
import { PreviewApp } from "./components/preview/PreviewApp";
import { HomePage } from "./components/home/HomePage";
import {
  check as checkForUpdate,
  type Update,
} from "@tauri-apps/plugin-updater";
import { getCurrentWindow } from "@tauri-apps/api/window";
import * as aiService from "./services/ai";
import type { AiProvider } from "./services/ai";
import { fetchUrlMetadata } from "./services/urlMetadata";
import { getSettings } from "./services/notes";

// Detect preview mode from URL search params
function getWindowMode(): {
  isPreview: boolean;
  previewFile: string | null;
} {
  const params = new URLSearchParams(window.location.search);
  const mode = params.get("mode");
  const file = params.get("file");
  return {
    isPreview: mode === "preview" && !!file,
    previewFile: file,
  };
}

type ViewState = "home" | "notes" | "settings";

function AppContent() {
  const {
    notesFolder,
    isLoading,
    createNote,
    saveNote,
    notes,
    selectedNoteId,
    selectNote,
    searchQuery,
    searchResults,
    reloadCurrentNote,
    currentNote,
    refreshNotes,
  } = useNotes();
  const { interfaceZoom, setInterfaceZoom } = useTheme();
  const interfaceZoomRef = useRef(interfaceZoom);
  interfaceZoomRef.current = interfaceZoom;
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [view, setView] = useState<ViewState>("home");
  const [sidebarVisible, setSidebarVisible] = useState(true);
  const [aiModalOpen, setAiModalOpen] = useState(false);
  const [aiEditing, setAiEditing] = useState(false);
  const [focusMode, setFocusMode] = useState(false);
  const [aiProvider, setAiProvider] = useState<AiProvider>("claude");
  const [chatWorkerUrl, setChatWorkerUrl] = useState<string | undefined>();
  const editorRef = useRef<TiptapEditor | null>(null);

  const loadChatWorkerUrl = useCallback(() => {
    if (!notesFolder) {
      setChatWorkerUrl(undefined);
      return;
    }

    getSettings()
      .then((settings) => {
        setChatWorkerUrl(settings.chatWorkerUrl?.trim() || undefined);
      })
      .catch(() => {
        setChatWorkerUrl(undefined);
      });
  }, [notesFolder]);

  useEffect(() => {
    loadChatWorkerUrl();
  }, [loadChatWorkerUrl]);

  useEffect(() => {
    const handleSettingsUpdated = () => {
      loadChatWorkerUrl();
    };

    window.addEventListener("settings-updated", handleSettingsUpdated);
    return () =>
      window.removeEventListener("settings-updated", handleSettingsUpdated);
  }, [loadChatWorkerUrl]);

  const toggleSidebar = useCallback(() => {
    setSidebarVisible((prev) => !prev);
  }, []);

  const toggleFocusMode = useCallback(() => {
    setFocusMode((prev) => {
      // Don't enter focus mode without a selected note
      if (!prev && !selectedNoteId) return prev;
      if (prev) {
        // Exiting focus mode — always restore sidebar
        setSidebarVisible(true);
      }
      return !prev;
    });
  }, [selectedNoteId]);

  const toggleSettings = useCallback(() => {
    setView((prev) => (prev === "settings" ? "notes" : "settings"));
  }, []);

  const closeSettings = useCallback(() => {
    setView("notes");
  }, []);

  const openHome = useCallback(() => {
    setView("home");
  }, []);

  const openNotesWorkspace = useCallback(() => {
    setView("notes");
  }, []);

  const openNoteFromHome = useCallback(
    async (id: string) => {
      await selectNote(id);
      setSidebarVisible(false);
      setView("notes");
    },
    [selectNote],
  );

  const createHomeNote = useCallback(
    async (title?: string, tag?: string) => {
      const created = await createNote();
      const heading = title ? `# ${title}` : `# ${created.title}`;
      const normalizedTag = tag?.replace(/^#/, "").trim().toLowerCase();
      const lines = [heading, ""];
      if (normalizedTag) lines.push(`#${normalizedTag}`, "");
      await saveNote(lines.join("\n"), created.id);
      setView("notes");
    },
    [createNote, saveNote],
  );

  const createHomeBookNote = useCallback(
    async (book: { title: string; author: string; coverUrl: string | null; year: number | null }) => {
      const created = await createNote();
      const lines = [`# ${book.title}`, ""];
      const meta: string[] = [];
      if (book.coverUrl) meta.push(`<!-- cover: ${book.coverUrl} -->`);
      meta.push(`**Author:** ${book.author}`);
      if (book.year) meta.push(`**Published:** ${book.year}`);
      lines.push(meta.join("\n"), "", "#book #to-read", "");
      await saveNote(lines.join("\n"), created.id);
      setView("notes");
    },
    [createNote, saveNote],
  );

  const createHomeUrlNote = useCallback(
    async (article: { title: string; author: string; publication: string; url: string; domain?: string; coverUrl: string | null; description: string | null; publishedAt: string | null }, tag: string) => {
      const created = await createNote();
      const lines = [`# ${article.title}`, ""];
      const meta: string[] = [];
      if (article.coverUrl) meta.push(`<!-- cover: ${article.coverUrl} -->`);
      if (article.url) meta.push(`<!-- link: ${article.url} -->`);
      if (article.author) meta.push(`**Author:** ${article.author}`);
      if (article.publication) {
        meta.push(`**Source:** [${article.publication}](${article.url})`);
      } else if (article.url) {
        meta.push(`**Link:** [${article.domain || article.url}](${article.url})`);
      }
      if (article.publishedAt) meta.push(`**Published:** ${article.publishedAt}`);
      if (meta.length) lines.push(meta.join("\n"), "");
      lines.push(`#${tag} #to-read`, "");
      await saveNote(lines.join("\n"), created.id);
      setView("notes");
    },
    [createNote, saveNote],
  );

  const createHomePasteNote = useCallback(
    async (url: string, status: string) => {
      try {
        const meta = await fetchUrlMetadata(url);
        const domain = meta.domain.toLowerCase();

        let typeTag = "blog";
        if (domain.includes("github.com") || domain.includes("stackoverflow.com") || domain.includes("dev.to") || domain.includes("medium.com") || domain.includes("hackernews")) typeTag = "technical";

        const created = await createNote();
        const lines = [`# ${meta.title}`, ""];
        const block: string[] = [];
        if (meta.coverUrl) block.push(`<!-- cover: ${meta.coverUrl} -->`);
        block.push(`<!-- link: ${meta.url} -->`);
        if (meta.author) block.push(`**Author:** ${meta.author}`);
        if (meta.publication) {
          block.push(`**Source:** [${meta.publication}](${meta.url})`);
        } else {
          block.push(`**Link:** [${meta.domain || meta.url}](${meta.url})`);
        }
        lines.push(block.join("\n"), "");
        lines.push(`#${typeTag} #${status}`, "");
        await saveNote(lines.join("\n"), created.id);
      } catch {
        toast.error("Could not fetch that link.");
      }
    },
    [createNote, saveNote],
  );

  // Go back to command palette from AI modal
  const handleBackToPalette = useCallback(() => {
    setAiModalOpen(false);
    setPaletteOpen(true);
  }, []);

  // AI Edit handler
  const handleAiEdit = useCallback(
    async (prompt: string, ollamaModel?: string) => {
      if (!currentNote) {
        toast.error("No note selected");
        return;
      }

      setAiEditing(true);

      try {
        let result: aiService.AiExecutionResult;
        if (aiProvider === "codex") {
          result = await aiService.executeCodexEdit(currentNote.path, prompt);
        } else if (aiProvider === "ollama") {
          result = await aiService.executeOllamaEdit(
            currentNote.path,
            prompt,
            ollamaModel || "qwen3:8b",
          );
        } else {
          result = await aiService.executeClaudeEdit(currentNote.path, prompt);
        }

        // Reload the current note from disk
        await reloadCurrentNote();

        // Show results
        if (result.success) {
          // Close modal after success
          setAiModalOpen(false);

          // Show success toast with provider response
          toast(
            <AiResponseToast output={result.output} provider={aiProvider} />,
            {
              duration: Infinity,
              closeButton: true,
              className: "!min-w-[450px] !max-w-[600px]",
            },
          );
        } else {
          toast.error(
            <div className="space-y-1">
              <div className="font-medium">AI Edit Failed</div>
              <div className="text-xs">{result.error || "Unknown error"}</div>
            </div>,
            { duration: Infinity, closeButton: true },
          );
        }
      } catch (error) {
        console.error("[AI] Error:", error);
        toast.error(
          `Error: ${error instanceof Error ? error.message : "Unknown error"}`,
        );
      } finally {
        setAiEditing(false);
      }
    },
    [aiProvider, currentNote, reloadCurrentNote],
  );

  // Memoize display items to prevent unnecessary recalculations
  const displayItems = useMemo(() => {
    return searchQuery.trim() ? searchResults : notes;
  }, [searchQuery, searchResults, notes]);

  // Global keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const isInEditor = target.closest(".ProseMirror");
      const isInInput =
        target.tagName === "INPUT" || target.tagName === "TEXTAREA";

      // Cmd+, - Toggle settings (always works, even in settings)
      if ((e.metaKey || e.ctrlKey) && e.key === ",") {
        e.preventDefault();
        toggleSettings();
        return;
      }

      // Cmd+= or Cmd++ - Zoom in (works everywhere, including settings)
      if ((e.metaKey || e.ctrlKey) && (e.key === "=" || e.key === "+")) {
        e.preventDefault();
        setInterfaceZoom((prev) => prev + 0.05);
        const newZoom = Math.round(Math.min(interfaceZoomRef.current + 0.05, 1.5) * 20) / 20;
        toast(`Zoom ${Math.round(newZoom * 100)}%`, { id: "zoom", duration: 1500 });
        return;
      }

      // Cmd+- - Zoom out (works everywhere, including settings)
      if ((e.metaKey || e.ctrlKey) && (e.key === "-" || e.key === "_")) {
        e.preventDefault();
        setInterfaceZoom((prev) => prev - 0.05);
        const newZoom = Math.round(Math.max(interfaceZoomRef.current - 0.05, 0.7) * 20) / 20;
        toast(`Zoom ${Math.round(newZoom * 100)}%`, { id: "zoom", duration: 1500 });
        return;
      }

      // Cmd+0 - Reset zoom (works everywhere, including settings)
      if ((e.metaKey || e.ctrlKey) && e.key === "0") {
        e.preventDefault();
        setInterfaceZoom(1.0);
        toast("Zoom 100%", { id: "zoom", duration: 1500 });
        return;
      }

      // Block all other shortcuts when in settings view
      if (view === "settings") {
        return;
      }

      // Cmd+Shift+Enter - Toggle focus mode
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === "Enter") {
        e.preventDefault();
        toggleFocusMode();
        return;
      }

      // Cmd+Shift+M - Toggle markdown source mode
      if (
        (e.metaKey || e.ctrlKey) &&
        e.shiftKey &&
        e.key.toLowerCase() === "m"
      ) {
        e.preventDefault();
        window.dispatchEvent(new CustomEvent("toggle-source-mode"));
        return;
      }

      // Escape exits focus mode when not in editor
      if (e.key === "Escape" && focusMode && !isInEditor) {
        e.preventDefault();
        toggleFocusMode();
        return;
      }

      // Trap Tab/Shift+Tab in notes view only - prevent focus navigation
      // TipTap handles indentation internally before event bubbles up
      if (view === "notes" && e.key === "Tab") {
        e.preventDefault();
        return;
      }

      // Cmd+P - Open command palette
      if ((e.metaKey || e.ctrlKey) && e.key === "p") {
        e.preventDefault();
        setPaletteOpen(true);
        return;
      }

      // Cmd/Ctrl+Shift+F - Open sidebar search
      if (
        (e.metaKey || e.ctrlKey) &&
        e.shiftKey &&
        e.key.toLowerCase() === "f"
      ) {
        e.preventDefault();
        setSidebarVisible(true);
        window.dispatchEvent(new CustomEvent("open-sidebar-search"));
        return;
      }

      // Cmd+\ - Toggle sidebar
      if ((e.metaKey || e.ctrlKey) && e.key === "\\") {
        e.preventDefault();
        toggleSidebar();
        return;
      }

      // Cmd+N - New note
      if ((e.metaKey || e.ctrlKey) && e.key === "n") {
        e.preventDefault();
        void createNote();
        setView("notes");
        return;
      }

      // Cmd+R - Reload current note (pull external changes)
      if ((e.metaKey || e.ctrlKey) && e.key === "r") {
        e.preventDefault();
        reloadCurrentNote();
        return;
      }

      // Arrow keys for note navigation (when not in editor or input)
      if (view === "notes" && !isInEditor && !isInInput && displayItems.length > 0) {
        if (e.key === "ArrowDown" || e.key === "ArrowUp") {
          e.preventDefault();
          const currentIndex = displayItems.findIndex(
            (n) => n.id === selectedNoteId,
          );
          let newIndex: number;

          if (e.key === "ArrowDown") {
            newIndex =
              currentIndex < displayItems.length - 1 ? currentIndex + 1 : 0;
          } else {
            newIndex =
              currentIndex > 0 ? currentIndex - 1 : displayItems.length - 1;
          }

          selectNote(displayItems[newIndex].id);
          return;
        }

        // Enter to focus editor
        if (e.key === "Enter" && selectedNoteId) {
          e.preventDefault();
          const editor = document.querySelector(".ProseMirror") as HTMLElement;
          if (editor) {
            editor.focus();
          }
          return;
        }
      }

      // Escape to blur editor and go back to note list
      if (e.key === "Escape" && isInEditor) {
        e.preventDefault();
        (target as HTMLElement).blur();
        // Focus the note list for keyboard navigation
        window.dispatchEvent(new CustomEvent("focus-note-list"));
        return;
      }
    };

    // Disable right-click context menu except in editor
    const handleContextMenu = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      // Allow context menu in editor (prose class) and inputs
      const isInEditor =
        target.closest(".prose") || target.closest(".ProseMirror");
      const isInput =
        target.tagName === "INPUT" || target.tagName === "TEXTAREA";
      if (!isInEditor && !isInput) {
        e.preventDefault();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("contextmenu", handleContextMenu);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("contextmenu", handleContextMenu);
    };
  }, [
    createNote,
    displayItems,
    reloadCurrentNote,
    selectedNoteId,
    selectNote,
    toggleSettings,
    toggleSidebar,
    toggleFocusMode,
    focusMode,
    view,
    setInterfaceZoom,
  ]);

  const handleClosePalette = useCallback(() => {
    setPaletteOpen(false);
  }, []);

  if (isLoading) {
    return (
      <div className="h-screen flex items-center justify-center bg-bg-secondary">
        <div className="text-text-muted/70 text-sm flex items-center gap-1.5 font-medium">
          <SpinnerIcon className="w-4.5 h-4.5 stroke-[1.5] animate-spin" />
          Initializing Think...
        </div>
      </div>
    );
  }

  if (!notesFolder) {
    return <FolderPicker />;
  }

  return (
    <>
      <div className="h-screen flex bg-bg overflow-hidden">
        {view === "settings" ? (
          <SettingsPage onBack={closeSettings} />
        ) : view === "home" ? (
          <HomePage
            notes={notes}
            onOpenNote={openNoteFromHome}
            onCreateNote={(title, tag) => {
              void createHomeNote(title, tag);
            }}
            onCreateBookNote={(book) => {
              void createHomeBookNote(book);
            }}
            onCreateUrlNote={(metadata, tag) => {
              void createHomeUrlNote(metadata, tag);
            }}
            onPasteUrl={(url, status) => {
              void createHomePasteNote(url, status);
            }}
            onOpenSettings={toggleSettings}
            onRefresh={() => void refreshNotes()}
            chatWorkerUrl={chatWorkerUrl}
          />
        ) : (
          <>
            <div
              className={`transition-all duration-500 ease-out overflow-hidden ${!sidebarVisible || focusMode ? "opacity-0 -translate-x-4 w-0 pointer-events-none" : "opacity-100 translate-x-0 w-64"}`}
            >
              <Sidebar onOpenSettings={toggleSettings} />
            </div>
            <Editor
              onToggleSidebar={toggleSidebar}
              onGoHome={openHome}
              sidebarVisible={sidebarVisible && !focusMode}
              focusMode={focusMode}
              onEditorReady={(editor) => {
                editorRef.current = editor;
              }}
            />
          </>
        )}
      </div>

      {/* Shared backdrop for command palette and AI modal */}
      {(paletteOpen || aiModalOpen) && (
        <div
          className="fixed inset-0 bg-black/50 backdrop-blur-sm z-40 animate-fade-in"
          onClick={() => {
            if (paletteOpen) handleClosePalette();
            if (aiModalOpen) setAiModalOpen(false);
          }}
        />
      )}

      <CommandPalette
        open={paletteOpen}
        onClose={handleClosePalette}
        onOpenSettings={toggleSettings}
        onOpenHome={openHome}
        onOpenNotesWorkspace={openNotesWorkspace}
        onOpenAiModal={(provider) => {
          setAiProvider(provider);
          setAiModalOpen(true);
        }}
        focusMode={focusMode}
        onToggleFocusMode={toggleFocusMode}
        editorRef={editorRef}
      />
      <AiEditModal
        open={aiModalOpen}
        provider={aiProvider}
        onBack={handleBackToPalette}
        onExecute={handleAiEdit}
        isExecuting={aiEditing}
      />

      {/* AI Editing Overlay */}
      {aiEditing && (
        <div className="fixed inset-0 bg-bg/50 backdrop-blur-sm z-50 flex items-center justify-center">
          <div className="flex items-center gap-2">
            {aiProvider === "codex" ? (
              <CodexIcon className="w-4.5 h-4.5 fill-text-muted animate-spin-slow" />
            ) : aiProvider === "ollama" ? (
              <OllamaIcon className="w-4.5 h-4.5 fill-text-muted animate-bounce-gentle" />
            ) : (
              <ClaudeIcon className="w-4.5 h-4.5 fill-text-muted animate-spin-slow" />
            )}
            <div className="text-sm font-medium text-text">
              {aiProvider === "codex"
                ? "Codex is editing your note..."
                : aiProvider === "ollama"
                  ? "Ollama is editing your note..."
                  : "Claude is editing your note..."}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// Shared update check — used by startup and manual "Check for Updates"
async function showUpdateToast(): Promise<"update" | "no-update" | "error"> {
  try {
    const update = await checkForUpdate();
    if (update) {
      toast(<UpdateToast update={update} toastId="update-toast" />, {
        id: "update-toast",
        duration: Infinity,
        closeButton: true,
      });
      return "update";
    }
    return "no-update";
  } catch (err) {
    // Network errors and 404s (no release published yet) are not real failures
    const msg = String(err);
    if (
      msg.includes("404") ||
      msg.includes("network") ||
      msg.includes("Could not fetch")
    ) {
      return "no-update";
    }
    console.error("Update check failed:", err);
    return "error";
  }
}

export { showUpdateToast };

function UpdateToast({
  update,
  toastId,
}: {
  update: Update;
  toastId: string | number;
}) {
  const [installing, setInstalling] = useState(false);

  const handleUpdate = async () => {
    setInstalling(true);
    try {
      await update.downloadAndInstall();
      toast.dismiss(toastId);
      toast.success("Update installed! Restart Think to apply.", {
        duration: Infinity,
        closeButton: true,
      });
    } catch (err) {
      console.error("Update failed:", err);
      toast.error("Update failed. Please try again later.");
      setInstalling(false);
    }
  };

  return (
    <div className="flex flex-col gap-1">
      <div className="font-medium text-sm">
        Update Available: v{update.version}
      </div>
      {update.body && (
        <div className="text-xs text-text-muted line-clamp-3">
          {update.body}
        </div>
      )}
      <button
        onClick={handleUpdate}
        disabled={installing}
        className="self-start mt-1 text-xs font-medium px-3 py-1.5 rounded-md bg-text text-bg hover:opacity-90 disabled:opacity-50 transition-opacity"
      >
        {installing ? "Installing..." : "Update Now"}
      </button>
    </div>
  );
}

function App() {
  const { isPreview, previewFile } = useMemo(getWindowMode, []);

  // Cmd/Ctrl+W — close window (works in both preview and folder mode)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "w") {
        e.preventDefault();
        getCurrentWindow().close().catch(console.error);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Add platform class for OS-specific styling (e.g., keyboard shortcuts)
  useEffect(() => {
    const isMac = /Mac|iPhone|iPad|iPod/.test(navigator.userAgent);
    document.documentElement.classList.add(
      isMac ? "platform-mac" : "platform-other",
    );
  }, []);

  // Check for app updates on startup (folder mode only)
  useEffect(() => {
    if (isPreview) return;
    const timer = setTimeout(() => showUpdateToast(), 3000);
    return () => clearTimeout(timer);
  }, [isPreview]);

  // Preview mode: lightweight editor without sidebar, search, git
  if (isPreview && previewFile) {
    return (
      <ThemeProvider>
        <Toaster />
        <TooltipProvider>
          <PreviewApp filePath={decodeURIComponent(previewFile)} />
        </TooltipProvider>
      </ThemeProvider>
    );
  }

  // Folder mode: full app with sidebar, search, git, etc.
  return (
    <ThemeProvider>
      <Toaster />
      <TooltipProvider>
        <NotesProvider>
          <GitProvider>
            <AppContent />
          </GitProvider>
        </NotesProvider>
      </TooltipProvider>
    </ThemeProvider>
  );
}

export default App;
