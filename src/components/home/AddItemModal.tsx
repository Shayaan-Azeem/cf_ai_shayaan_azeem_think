import {
  useState,
  useRef,
  useEffect,
  useCallback,
  type KeyboardEvent,
} from "react";
import { PlusIcon, SearchIcon, SpinnerIcon } from "../icons";
import { searchBooks, type BookSearchResult } from "../../services/books";
import { fetchUrlMetadata, type UrlMetadata } from "../../services/urlMetadata";

interface AddItemModalProps {
  open: boolean;
  onClose: () => void;
  onAddBook: (book: BookSearchResult) => void;
  onAddUrl: (metadata: UrlMetadata, tag: string) => void;
  onAddNote: (title: string, tag?: string) => void;
}

type InputMode = "idle" | "url" | "search";

interface UrlResult {
  metadata: UrlMetadata;
  suggestedTag: string;
}

const URL_TYPE_OPTIONS = [
  { tag: "blog", label: "Blog" },
  { tag: "technical", label: "Technical" },
  { tag: "link", label: "Link" },
] as const;

function isUrl(text: string): boolean {
  if (/^https?:\/\//i.test(text)) return true;
  if (/^[a-z0-9-]+(\.[a-z]{2,})+/i.test(text) && text.includes(".")) return true;
  return false;
}

function inferTag(domain: string): string {
  const d = domain.toLowerCase();
  if (d.includes("substack.com") || d.includes("newsletter")) return "blog";
  if (
    d.includes("github.com") ||
    d.includes("stackoverflow.com") ||
    d.includes("dev.to") ||
    d.includes("arxiv.org") ||
    d.includes("hackernews") ||
    d.includes("news.ycombinator.com")
  )
    return "technical";
  if (d.includes("x.com") || d.includes("twitter.com")) return "blog";
  return "blog";
}

const NOTE_TYPES = [
  { tag: "note", label: "Note" },
  { tag: "journal", label: "Journal" },
  { tag: "blog", label: "Blog" },
  { tag: "technical", label: "Technical" },
] as const;

export function AddItemModal({
  open,
  onClose,
  onAddBook,
  onAddUrl,
  onAddNote,
}: AddItemModalProps) {
  const [query, setQuery] = useState("");
  const [mode, setMode] = useState<InputMode>("idle");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [bookResults, setBookResults] = useState<BookSearchResult[]>([]);
  const [urlResult, setUrlResult] = useState<UrlResult | null>(null);
  const [selectedIndex, setSelectedIndex] = useState(0);

  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const requestIdRef = useRef(0);

  useEffect(() => {
    if (open) {
      setQuery("");
      setMode("idle");
      setLoading(false);
      setError(null);
      setBookResults([]);
      setUrlResult(null);
      setSelectedIndex(0);
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

  const searchForBooks = useCallback(async (q: string) => {
    const id = ++requestIdRef.current;
    const trimmed = q.trim();
    if (trimmed.length < 2) {
      setBookResults([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const items = await searchBooks(trimmed, 5);
      if (id !== requestIdRef.current) return;
      setBookResults(items);
      setSelectedIndex(0);
    } catch {
      if (id !== requestIdRef.current) return;
      setBookResults([]);
    } finally {
      if (id === requestIdRef.current) setLoading(false);
    }
  }, []);

  const fetchUrl = useCallback(async (rawUrl: string) => {
    const id = ++requestIdRef.current;
    let normalized = rawUrl.trim();
    if (!/^https?:\/\//i.test(normalized)) {
      normalized = `https://${normalized}`;
    }
    setLoading(true);
    setError(null);
    setUrlResult(null);
    try {
      const metadata = await fetchUrlMetadata(normalized);
      if (id !== requestIdRef.current) return;
      const suggested = inferTag(metadata.domain);
      setUrlResult({ metadata, suggestedTag: suggested });
      setSelectedIndex(suggested === "technical" ? 1 : 0);
    } catch {
      if (id !== requestIdRef.current) return;
      setError("Couldn't fetch that URL. Check the link and try again.");
    } finally {
      if (id === requestIdRef.current) setLoading(false);
    }
  }, []);

  const handleInputChange = useCallback(
    (value: string) => {
      setQuery(value);
      setError(null);
      setUrlResult(null);

      if (debounceRef.current) clearTimeout(debounceRef.current);

      const trimmed = value.trim();
      if (!trimmed) {
        setMode("idle");
        setBookResults([]);
        setLoading(false);
        return;
      }

      if (isUrl(trimmed)) {
        setMode("url");
        setBookResults([]);
        debounceRef.current = setTimeout(() => fetchUrl(trimmed), 400);
      } else {
        setMode("search");
        setUrlResult(null);
        debounceRef.current = setTimeout(() => searchForBooks(value), 300);
      }
    },
    [searchForBooks, fetchUrl],
  );

  const urlItemCount = urlResult ? URL_TYPE_OPTIONS.length : 0;
  const searchItemCount = bookResults.length + NOTE_TYPES.length;
  const totalItems = mode === "url" ? urlItemCount : mode === "search" ? searchItemCount : 0;

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((prev) => Math.min(prev + 1, totalItems - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((prev) => Math.max(prev - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (mode === "url") {
        if (urlResult) {
          const opt = URL_TYPE_OPTIONS[selectedIndex];
          if (opt) onAddUrl(urlResult.metadata, opt.tag);
        }
      } else if (mode === "search") {
        if (selectedIndex < bookResults.length) {
          onAddBook(bookResults[selectedIndex]);
        } else {
          const noteIdx = selectedIndex - bookResults.length;
          const type = NOTE_TYPES[noteIdx];
          if (type) {
            onAddNote(query.trim(), type.tag);
          }
        }
      } else if (query.trim()) {
        onAddNote(query.trim());
      }
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh] px-4 pointer-events-none">
      <div className="relative w-full max-w-lg bg-bg rounded-xl shadow-2xl overflow-hidden border border-border animate-slide-down pointer-events-auto">
        <div className="flex items-center gap-3 px-4 py-3 border-b border-border">
          {mode === "url" ? (
            <span className="text-xs font-medium text-text-muted bg-bg-muted px-1.5 py-0.5 rounded shrink-0">
              URL
            </span>
          ) : (
            <SearchIcon className="w-4.5 h-4.5 text-text-muted shrink-0" />
          )}
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => handleInputChange(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search for a book, paste a link, or type a title..."
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

        <div className="max-h-80 overflow-y-auto">
          {mode === "url" && urlResult && (
            <div className="py-1">
              {URL_TYPE_OPTIONS.map((opt, i) => (
                <button
                  key={opt.tag}
                  type="button"
                  onClick={() => onAddUrl(urlResult.metadata, opt.tag)}
                  className={`w-full text-left px-4 py-2.5 flex items-center gap-3 transition-colors cursor-pointer ${
                    i === selectedIndex ? "bg-bg-muted" : "hover:bg-bg-muted"
                  }`}
                >
                  {urlResult.metadata.coverUrl ? (
                    <img
                      src={urlResult.metadata.coverUrl}
                      alt=""
                      className="w-8 h-8 rounded object-cover bg-bg-muted shrink-0"
                      loading="lazy"
                    />
                  ) : (
                    <div className="w-8 h-8 rounded bg-bg-muted shrink-0 flex items-center justify-center">
                      <span className="text-xs text-text-muted font-medium">
                        {urlResult.metadata.domain.charAt(0).toUpperCase()}
                      </span>
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="text-sm text-text truncate">
                      <span className="font-medium">{urlResult.metadata.title}</span>
                      <span className="text-text-muted ml-1.5">as {opt.label}</span>
                    </div>
                    <div className="text-xs text-text-muted truncate">
                      {urlResult.metadata.domain}
                      {urlResult.metadata.author ? ` · ${urlResult.metadata.author}` : ""}
                    </div>
                  </div>
                  {opt.tag === urlResult.suggestedTag && (
                    <span className="text-[10px] font-medium text-text-muted bg-bg-muted px-1.5 py-0.5 rounded shrink-0">
                      suggested
                    </span>
                  )}
                </button>
              ))}
            </div>
          )}

          {mode === "url" && loading && (
            <div className="px-4 py-5 text-center text-sm text-text-muted">
              Fetching link info…
            </div>
          )}

          {mode === "url" && !urlResult && !loading && error && (
            <div className="px-4 py-5 text-center text-sm text-text-muted">
              {error}
            </div>
          )}

          {mode === "search" && (
            <div className="py-1">
              {bookResults.length > 0 && (
                <>
                  <div className="px-4 pt-2 pb-1 text-[11px] font-medium text-text-muted uppercase tracking-wider">
                    Books
                  </div>
                  {bookResults.map((book, i) => (
                    <button
                      key={`${book.workKey}-${i}`}
                      type="button"
                      onClick={() => onAddBook(book)}
                      className={`w-full text-left px-4 py-2 flex items-center gap-3 transition-colors cursor-pointer ${
                        i === selectedIndex ? "bg-bg-muted" : "hover:bg-bg-muted"
                      }`}
                    >
                      {book.coverUrl ? (
                        <img
                          src={book.coverUrl}
                          alt=""
                          className="w-8 h-11 rounded object-cover bg-bg-muted shrink-0"
                          loading="lazy"
                        />
                      ) : (
                        <div className="w-8 h-11 rounded bg-bg-muted shrink-0 flex items-center justify-center">
                          <span className="text-sm text-text-muted font-serif">
                            {book.title.charAt(0)}
                          </span>
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium text-text truncate">
                          {book.title}
                        </div>
                        <div className="text-xs text-text-muted truncate">
                          {book.author}
                          {book.year ? ` \u00b7 ${book.year}` : ""}
                        </div>
                      </div>
                    </button>
                  ))}
                </>
              )}

              <div className="px-4 pt-2.5 pb-1 text-[11px] font-medium text-text-muted uppercase tracking-wider">
                Create
              </div>
              {NOTE_TYPES.map((type, i) => {
                const idx = bookResults.length + i;
                return (
                  <button
                    key={type.tag}
                    type="button"
                    onClick={() => onAddNote(query.trim(), type.tag)}
                    className={`w-full text-left px-4 py-2 flex items-center gap-3 transition-colors cursor-pointer ${
                      idx === selectedIndex ? "bg-bg-muted" : "hover:bg-bg-muted"
                    }`}
                  >
                    <div className="w-8 h-8 rounded bg-bg-muted shrink-0 flex items-center justify-center">
                      <PlusIcon className="w-3.5 h-3.5 text-text-muted" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm text-text">
                        <span className="font-medium">{query.trim()}</span>
                        <span className="text-text-muted ml-1.5">as {type.label}</span>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          {mode === "idle" && (
            <div className="px-4 py-6 text-center space-y-1.5">
              <div className="text-sm text-text-muted">
                Search for a book, paste a URL, or type a title
              </div>
              <div className="text-xs text-text-muted/60">
                Links are auto-detected and fetched
              </div>
            </div>
          )}
        </div>

        <div className="border-t border-border px-4 py-2.5 flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-xs text-text-muted">
            <kbd className="px-1.5 py-0.5 rounded bg-bg-muted text-text-muted">Esc</kbd>
            <span>to close</span>
          </div>
          <div className="flex items-center gap-3 text-xs text-text-muted">
            {totalItems > 0 && (
              <span className="flex items-center gap-1.5">
                <kbd className="px-1.5 py-0.5 rounded bg-bg-muted text-text-muted">↑↓</kbd>
                <span>navigate</span>
              </span>
            )}
            <span className="flex items-center gap-1.5">
              <kbd className="px-1.5 py-0.5 rounded bg-bg-muted text-text-muted">Enter</kbd>
              <span>select</span>
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
