import {
  useState,
  useRef,
  useEffect,
  useCallback,
  type KeyboardEvent,
} from "react";
import { LinkIcon, SpinnerIcon } from "../icons";
import {
  fetchSubstackUrl,
  type SubstackArticleResult,
} from "../../services/substack";

interface SubstackSearchModalProps {
  open: boolean;
  onClose: () => void;
  onSelect: (article: SubstackArticleResult) => void;
}

export function SubstackSearchModal({
  open,
  onClose,
  onSelect,
}: SubstackSearchModalProps) {
  const [urlValue, setUrlValue] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setUrlValue("");
      setError(null);
      setLoading(false);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handleEscape = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [open, onClose]);

  const handleSubmit = useCallback(async () => {
    const trimmed = urlValue.trim();
    if (!trimmed) return;

    setLoading(true);
    setError(null);

    try {
      const article = await fetchSubstackUrl(trimmed);
      onSelect(article);
    } catch {
      setError("Could not fetch article. Check the URL and try again.");
    } finally {
      setLoading(false);
    }
  }, [urlValue, onSelect]);

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      void handleSubmit();
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh] px-4 pointer-events-none">
      <div className="relative w-full max-w-lg bg-bg rounded-xl shadow-2xl overflow-hidden border border-border animate-slide-down pointer-events-auto">
        <div className="flex items-center gap-3 px-4 py-3 border-b border-border">
          <LinkIcon className="w-4.5 h-4.5 text-text-muted shrink-0" />
          <input
            ref={inputRef}
            type="url"
            value={urlValue}
            onChange={(e) => {
              setUrlValue(e.target.value);
              setError(null);
            }}
            onKeyDown={handleKeyDown}
            placeholder="Paste a Substack or article URL..."
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
            className="flex-1 text-[15px] bg-transparent outline-none text-text placeholder-text-muted/50"
          />
          {loading && (
            <SpinnerIcon className="w-4.5 h-4.5 animate-spin text-text-muted shrink-0" />
          )}
        </div>

        <div className="px-4 py-4 space-y-3">
          {error && (
            <div className="text-sm text-red-500">{error}</div>
          )}
          <button
            type="button"
            disabled={!urlValue.trim() || loading}
            onClick={() => void handleSubmit()}
            className="w-full py-2 rounded-md text-sm font-medium transition-colors bg-text text-text-inverse hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {loading ? "Fetching..." : "Add Article"}
          </button>
        </div>

        <div className="border-t border-border px-4 py-2.5 flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-xs text-text-muted">
            <kbd className="px-1.5 py-0.5 rounded bg-bg-muted text-text-muted">
              Esc
            </kbd>
            <span>to close</span>
          </div>
          <div className="flex items-center gap-1.5 text-xs text-text-muted">
            <kbd className="px-1.5 py-0.5 rounded bg-bg-muted text-text-muted">
              Enter
            </kbd>
            <span>to add</span>
          </div>
        </div>
      </div>
    </div>
  );
}
