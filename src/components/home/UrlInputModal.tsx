import { useState, useRef, useEffect, type KeyboardEvent } from "react";
import { SearchIcon, SpinnerIcon } from "../icons";
import { fetchUrlMetadata, type UrlMetadata } from "../../services/urlMetadata";
import { Button } from "../ui";

interface UrlInputModalProps {
  open: boolean;
  label: string;
  placeholder?: string;
  onClose: () => void;
  onSelect: (metadata: UrlMetadata) => void;
}

export function UrlInputModal({
  open,
  label,
  placeholder,
  onClose,
  onSelect,
}: UrlInputModalProps) {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<UrlMetadata | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setUrl("");
      setResult(null);
      setError(null);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handleEscape = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        if (result) {
          setResult(null);
        } else {
          onClose();
        }
      }
    };
    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [open, onClose, result]);

  const handleFetch = async () => {
    const trimmed = url.trim();
    if (!trimmed) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const metadata = await fetchUrlMetadata(trimmed);
      setResult(metadata);
    } catch {
      setError("Couldn't fetch that URL. Check the link and try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleFetch();
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh] px-4 pointer-events-none">
      <div className="relative w-full max-w-lg bg-bg rounded-xl shadow-2xl overflow-hidden border border-border animate-slide-down pointer-events-auto">
        <div className="flex items-center gap-3 px-4 py-3 border-b border-border">
          <SearchIcon className="w-4.5 h-4.5 text-text-muted shrink-0" />
          <input
            ref={inputRef}
            type="url"
            value={url}
            onChange={(e) => {
              setUrl(e.target.value);
              setResult(null);
              setError(null);
            }}
            onKeyDown={handleKeyDown}
            placeholder={placeholder ?? `Paste a ${label} URL...`}
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

        {result && (
          <div className="p-4 flex items-start gap-4">
            {result.coverUrl ? (
              <img
                src={result.coverUrl}
                alt=""
                className="w-20 h-28 rounded object-cover bg-bg-muted shrink-0"
                loading="lazy"
              />
            ) : (
              <div className="w-20 h-28 rounded bg-bg-muted shrink-0 flex items-center justify-center">
                <span className="text-2xl text-text-muted font-serif">
                  {result.title.charAt(0)}
                </span>
              </div>
            )}
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold text-text leading-snug line-clamp-2">
                {result.title}
              </div>
              {result.author && (
                <div className="text-xs text-text-muted mt-1 truncate">
                  {result.author}
                </div>
              )}
              {result.publication && (
                <div className="text-xs text-text-muted truncate">
                  {result.publication}
                </div>
              )}
              {result.publishedAt && (
                <div className="text-xs text-text-muted mt-0.5">
                  {result.publishedAt}
                </div>
              )}
            </div>
          </div>
        )}

        {error && (
          <div className="px-4 py-6 text-center text-sm text-text-muted">
            {error}
          </div>
        )}

        <div className="border-t border-border px-4 py-2.5 flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-xs text-text-muted">
            <kbd className="px-1.5 py-0.5 rounded bg-bg-muted text-text-muted">
              Esc
            </kbd>
            <span>to close</span>
          </div>
          {result ? (
            <Button
              variant="primary"
              size="sm"
              onClick={() => onSelect(result)}
            >
              Add {label}
            </Button>
          ) : (
            <div className="flex items-center gap-1.5 text-xs text-text-muted">
              <kbd className="px-1.5 py-0.5 rounded bg-bg-muted text-text-muted">
                Enter
              </kbd>
              <span>to fetch</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
