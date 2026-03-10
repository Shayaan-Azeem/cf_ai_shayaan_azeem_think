import {
  useState,
  useRef,
  useEffect,
  useCallback,
  type KeyboardEvent,
} from "react";
import { SearchIcon, SpinnerIcon } from "../icons";
import { searchBooks, type BookSearchResult } from "../../services/books";

interface BookSearchModalProps {
  open: boolean;
  onClose: () => void;
  onSelect: (book: BookSearchResult) => void;
}

export function BookSearchModal({
  open,
  onClose,
  onSelect,
}: BookSearchModalProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<BookSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const requestIdRef = useRef(0);

  useEffect(() => {
    if (open) {
      setQuery("");
      setResults([]);
      setError(null);
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

  const doSearch = useCallback(async (q: string) => {
    const id = ++requestIdRef.current;
    const trimmed = q.trim();
    if (trimmed.length < 2) {
      setResults([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const items = await searchBooks(trimmed, 8);
      if (id !== requestIdRef.current) return;
      setResults(items);
      setSelectedIndex(0);
    } catch (err) {
      if (id !== requestIdRef.current) return;
      setError("Search failed. Check your internet connection.");
      setResults([]);
    } finally {
      if (id === requestIdRef.current) setLoading(false);
    }
  }, []);

  const handleInputChange = useCallback(
    (value: string) => {
      setQuery(value);
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => doSearch(value), 250);
    },
    [doSearch],
  );

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((prev) => Math.min(prev + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((prev) => Math.max(prev - 1, 0));
    } else if (e.key === "Enter" && results.length > 0) {
      e.preventDefault();
      onSelect(results[selectedIndex]);
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
            type="text"
            value={query}
            onChange={(e) => handleInputChange(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search for a book by title or author..."
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
          {results.length > 0 ? (
            <div className="py-1">
              {results.map((book, i) => (
                <button
                  key={`${book.workKey}-${i}`}
                  type="button"
                  onClick={() => onSelect(book)}
                  className={`w-full text-left px-4 py-2.5 flex items-center gap-3 transition-colors cursor-pointer ${
                    i === selectedIndex
                      ? "bg-bg-muted"
                      : "hover:bg-bg-muted"
                  }`}
                >
                  {book.coverUrl ? (
                    <img
                      src={book.coverUrl}
                      alt=""
                      className="w-10 h-14 rounded object-cover bg-bg-muted shrink-0"
                      loading="lazy"
                    />
                  ) : (
                    <div className="w-10 h-14 rounded bg-bg-muted shrink-0 flex items-center justify-center">
                      <span className="text-lg text-text-muted font-serif">
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
            </div>
          ) : query.trim().length >= 2 && !loading ? (
            <div className="px-4 py-6 text-center text-sm text-text-muted">
              {error || "No books found. Try a different title or author."}
            </div>
          ) : query.trim().length < 2 && query.trim().length > 0 ? (
            <div className="px-4 py-6 text-center text-sm text-text-muted">
              Type at least 2 characters to search.
            </div>
          ) : null}
        </div>

        <div className="border-t border-border px-4 py-2.5 flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-xs text-text-muted">
            <kbd className="px-1.5 py-0.5 rounded bg-bg-muted text-text-muted">
              Esc
            </kbd>
            <span>to close</span>
          </div>
          {results.length > 0 && (
            <div className="flex items-center gap-1.5 text-xs text-text-muted">
              <kbd className="px-1.5 py-0.5 rounded bg-bg-muted text-text-muted">
                Enter
              </kbd>
              <span>to select</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
