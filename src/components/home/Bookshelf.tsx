import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { ArrowLeftIcon, ArrowRightIcon } from "../icons";
import { cleanTitle } from "../../lib/utils";

interface BookshelfBook {
  id: string;
  title: string;
  spineColor: string;
  textColor: string;
  coverBackground: string;
  coverImage?: string | null;
}

interface BookshelfProps {
  books: BookshelfBook[];
  onOpenBook: (id: string) => void;
}

function hashString(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

function makeBookColors(id: string): Pick<BookshelfBook, "spineColor" | "textColor" | "coverBackground"> {
  const hash = hashString(id);
  const hue = hash % 360;
  const hue2 = (hue + 28) % 360;
  const lightMode = 42;

  return {
    spineColor: `hsl(${hue} 40% ${lightMode}%)`,
    textColor: "rgba(255, 255, 255, 0.92)",
    coverBackground: `linear-gradient(135deg, hsl(${hue} 54% ${lightMode + 10}%) 0%, hsl(${hue2} 56% ${Math.max(lightMode - 8, 28)}%) 100%)`,
  };
}

const spineColorCache = new Map<string, string>();

async function extractSpineColor(imageUrl: string): Promise<string | null> {
  const cached = spineColorCache.get(imageUrl);
  if (cached) return cached;

  // Fetch via Rust to avoid canvas CORS taint restrictions
  let dataUrl: string;
  try {
    dataUrl = await invoke<string>("fetch_image_as_data_url", { url: imageUrl });
  } catch {
    return null;
  }

  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        const sampleH = Math.min(img.naturalHeight, 200);
        canvas.width = 1;
        canvas.height = sampleH;
        const ctx = canvas.getContext("2d");
        if (!ctx) { resolve(null); return; }
        // Sample the leftmost 4px column (spine edge) averaged down the height
        ctx.drawImage(img, 0, 0, 4, sampleH, 0, 0, 1, sampleH);
        const data = ctx.getImageData(0, 0, 1, sampleH).data;
        let r = 0, g = 0, b = 0, count = 0;
        for (let i = 0; i < data.length; i += 4) {
          r += data[i];
          g += data[i + 1];
          b += data[i + 2];
          count++;
        }
        if (count === 0) { resolve(null); return; }
        const color = `rgb(${Math.round(r / count)}, ${Math.round(g / count)}, ${Math.round(b / count)})`;
        spineColorCache.set(imageUrl, color);
        resolve(color);
      } catch {
        resolve(null);
      }
    };
    img.onerror = () => resolve(null);
    img.src = dataUrl;
  });
}

function buildInitialColors(books: BookshelfBook[]): Record<string, string> {
  const initial: Record<string, string> = {};
  for (const book of books) {
    if (book.coverImage) {
      const cached = spineColorCache.get(book.coverImage);
      if (cached) initial[book.id] = cached;
    }
  }
  return initial;
}

function useSpineColors(books: BookshelfBook[]): Record<string, string> {
  const [colors, setColors] = useState<Record<string, string>>(() => buildInitialColors(books));

  useEffect(() => {
    let cancelled = false;
    const coverBooks = books.filter((b) => b.coverImage);
    if (coverBooks.length === 0) return;

    for (const book of coverBooks) {
      if (colors[book.id]) continue;
      extractSpineColor(book.coverImage!).then((color) => {
        if (cancelled || !color) return;
        setColors((prev) => ({ ...prev, [book.id]: color }));
      });
    }

    return () => { cancelled = true; };
  }, [books, colors]);

  return colors;
}

export function Bookshelf({ books, onOpenBook }: BookshelfProps) {
  const [bookIndex, setBookIndex] = useState(-1);
  const [scroll, setScroll] = useState(0);
  const [isScrolling, setIsScrolling] = useState(false);
  const [booksInViewport, setBooksInViewport] = useState(0);
  const spineColors = useSpineColors(books);

  const viewportRef = useRef<HTMLDivElement>(null);
  const scrollRightRef = useRef<HTMLDivElement>(null);
  const scrollLeftRef = useRef<HTMLDivElement>(null);

  const width = 41.5;
  const height = 220;

  const spineWidth = `${width}px`;
  const coverWidth = `${width * 4}px`;
  const bookWidth = `${width * 5}px`;
  const bookHeight = `${height}px`;

  const minScroll = 0;
  const maxScroll = useMemo(() => {
    return (
      (width + 12) * (books.length - booksInViewport) +
      (bookIndex > -1 ? width * 4 : 0) +
      5
    );
  }, [bookIndex, books.length, booksInViewport]);

  const boundedScroll = useCallback(
    (scrollX: number) => {
      setScroll(Math.max(minScroll, Math.min(maxScroll, scrollX)));
    },
    [maxScroll],
  );

  const boundedRelativeScroll = useCallback(
    (incrementX: number) => {
      setScroll((currentScroll) =>
        Math.max(minScroll, Math.min(maxScroll, currentScroll + incrementX)),
      );
    },
    [maxScroll],
  );

  useEffect(() => {
    if (bookIndex === -1) {
      boundedRelativeScroll(0);
    } else {
      boundedScroll((bookIndex - (booksInViewport - 4.5) / 2) * (width + 11));
    }
  }, [bookIndex, booksInViewport, boundedRelativeScroll, boundedScroll]);

  useEffect(() => {
    const currentViewport = viewportRef.current;
    if (!currentViewport) return;

    const updateViewport = () => {
      const viewportWidth = currentViewport.getBoundingClientRect().width;
      setBooksInViewport(viewportWidth / (width + 11));
      boundedRelativeScroll(0);
    };

    const observer = new ResizeObserver(updateViewport);
    observer.observe(currentViewport);
    updateViewport();

    return () => observer.disconnect();
  }, [boundedRelativeScroll]);

  useEffect(() => {
    const currentScrollRightRef = scrollRightRef.current;
    const currentScrollLeftRef = scrollLeftRef.current;
    if (!currentScrollRightRef || !currentScrollLeftRef) {
      return;
    }

    const isTouchDevice = window.matchMedia("(pointer: coarse)").matches;
    const scrollEvents = isTouchDevice
      ? { start: "touchstart", stop: "touchend" }
      : { start: "mouseenter", stop: "mouseleave" };

    let scrollInterval: number | null = null;

    const setScrollRightInterval = () => {
      setIsScrolling(true);
      scrollInterval = window.setInterval(() => {
        boundedRelativeScroll(3);
      }, 10);
    };

    const setScrollLeftInterval = () => {
      setIsScrolling(true);
      scrollInterval = window.setInterval(() => {
        boundedRelativeScroll(-3);
      }, 10);
    };

    const clearScrollInterval = () => {
      setIsScrolling(false);
      if (scrollInterval) {
        window.clearInterval(scrollInterval);
      }
      scrollInterval = null;
    };

    currentScrollRightRef.addEventListener(
      scrollEvents.start,
      setScrollRightInterval,
    );
    currentScrollRightRef.addEventListener(scrollEvents.stop, clearScrollInterval);

    currentScrollLeftRef.addEventListener(scrollEvents.start, setScrollLeftInterval);
    currentScrollLeftRef.addEventListener(scrollEvents.stop, clearScrollInterval);

    return () => {
      clearScrollInterval();
      currentScrollRightRef.removeEventListener(
        scrollEvents.start,
        setScrollRightInterval,
      );
      currentScrollRightRef.removeEventListener(
        scrollEvents.stop,
        clearScrollInterval,
      );
      currentScrollLeftRef.removeEventListener(
        scrollEvents.start,
        setScrollLeftInterval,
      );
      currentScrollLeftRef.removeEventListener(scrollEvents.stop, clearScrollInterval);
    };
  }, [boundedRelativeScroll]);

  return (
    <>
      <svg
        style={{
          position: "absolute",
          inset: 0,
          visibility: "hidden",
        }}
      >
        <defs>
          <filter id="paper" x="0%" y="0%" width="100%" height="100%">
            <feTurbulence
              type="fractalNoise"
              baseFrequency="0.9"
              numOctaves="8"
              result="noise"
            />
            <feDiffuseLighting
              in="noise"
              lightingColor="white"
              surfaceScale="1"
              result="diffLight"
            >
              <feDistantLight azimuth="45" elevation="35" />
            </feDiffuseLighting>
          </filter>
        </defs>
      </svg>

      <div className="relative">
        <div
          className="absolute left-[-28px] md:left-[-36px] h-full"
          style={{ display: scroll > minScroll ? "block" : "none" }}
        >
          <div
            ref={scrollLeftRef}
            className="h-full w-7 md:w-7 rounded-md md:rounded-r-md md:rounded-l-none flex items-center justify-center hover:bg-bg-muted transition-colors"
          >
            <ArrowLeftIcon className="w-3.5 h-3.5 stroke-[1.8]" />
          </div>
        </div>

        <div
          ref={viewportRef}
          className="flex items-center gap-1 overflow-x-hidden cursor-grab active:cursor-grabbing"
        >
          {books.map((book, index) => {
            const isSelected = bookIndex === index;

            return (
              <button
                key={book.id}
                onClick={() => onOpenBook(book.id)}
                onMouseEnter={() => setBookIndex(index)}
                onMouseLeave={() => setBookIndex(-1)}
                style={{
                  display: "flex",
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "flex-start",
                  outline: "none",
                  flexShrink: 0,
                  transform: `translateX(-${scroll}px)`,
                  width: isSelected ? bookWidth : spineWidth,
                  perspective: "1000px",
                  WebkitPerspective: "1000px",
                  gap: "0px",
                  transition: isScrolling ? "transform 100ms linear" : "all 500ms ease",
                  willChange: "auto",
                }}
                className="text-left"
                title={cleanTitle(book.title)}
              >
                <div
                  className="relative flex items-start justify-center shrink-0"
                  style={{
                    width: spineWidth,
                    height: bookHeight,
                    transformOrigin: "right",
                    backgroundColor: spineColors[book.id] || book.spineColor,
                    color: book.textColor,
                    transform: `translate3d(0px, 0px, 0px) scale3d(1, 1, 1) rotateX(0deg) rotateY(${isSelected ? "-60deg" : "0deg"}) rotateZ(0deg) skew(0deg, 0deg)`,
                    transition: "transform 500ms ease",
                    willChange: "auto",
                    filter: "brightness(0.8) contrast(2)",
                    transformStyle: "preserve-3d",
                  }}
                >
                  <span
                    style={{
                      pointerEvents: "none",
                      position: "fixed",
                      top: 0,
                      left: 0,
                      zIndex: 50,
                      height: bookHeight,
                      width: spineWidth,
                      opacity: 0.4,
                      filter: "url(#paper)",
                    }}
                  />
                  <h2
                    className="mt-3 text-[10px] font-semibold tracking-wider leading-tight overflow-hidden"
                    style={{
                      writingMode: "vertical-rl",
                      textOrientation: "mixed",
                      userSelect: "none",
                      maxHeight: `${height - 24}px`,
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                      maxWidth: `${width - 8}px`,
                    }}
                  >
                    {cleanTitle(book.title)}
                  </h2>
                </div>
                <div
                  className="relative shrink-0 overflow-hidden"
                  style={{
                    transformOrigin: "left",
                    transform: `translate3d(0px, 0px, 0px) scale3d(1, 1, 1) rotateX(0deg) rotateY(${isSelected ? "30deg" : "88.8deg"}) rotateZ(0deg) skew(0deg, 0deg)`,
                    transition: "all 500ms ease",
                    willChange: "auto",
                    filter: "brightness(0.8) contrast(2)",
                    transformStyle: "preserve-3d",
                  }}
                >
                  <span
                    style={{
                      pointerEvents: "none",
                      position: "fixed",
                      top: 0,
                      right: 0,
                      zIndex: 50,
                      height: bookHeight,
                      width: coverWidth,
                      opacity: 0.4,
                      filter: "url(#paper)",
                    }}
                  />
                  <span
                    style={{
                      pointerEvents: "none",
                      position: "absolute",
                      top: 0,
                      left: 0,
                      zIndex: 50,
                      height: bookHeight,
                      width: coverWidth,
                      background:
                        "linear-gradient(to right, rgba(255, 255, 255, 0) 2px, rgba(255, 255, 255, 0.5) 3px, rgba(255, 255, 255, 0.25) 4px, rgba(255, 255, 255, 0.25) 6px, transparent 7px, transparent 9px, rgba(255, 255, 255, 0.25) 9px, transparent 12px)",
                    }}
                  />
                  {book.coverImage ? (
                    <img
                      src={book.coverImage}
                      alt={cleanTitle(book.title)}
                      style={{
                        width: coverWidth,
                        height: bookHeight,
                        objectFit: "cover",
                        transition: "all 500ms ease",
                        willChange: "auto",
                      }}
                      loading="lazy"
                    />
                  ) : (
                    <div
                      style={{
                        width: coverWidth,
                        height: bookHeight,
                        background: book.coverBackground,
                        transition: "all 500ms ease",
                        willChange: "auto",
                      }}
                      className="flex items-end p-3"
                    >
                      <div className="text-[11px] font-medium text-white/90 line-clamp-3">
                        {cleanTitle(book.title)}
                      </div>
                    </div>
                  )}
                </div>
              </button>
            );
          })}
        </div>

        <div
          className="absolute right-[-28px] md:right-[-36px] h-full top-0 pl-2.5"
          style={{ display: scroll < maxScroll ? "block" : "none" }}
        >
          <div
            ref={scrollRightRef}
            className="h-full w-7 rounded-md md:rounded-l-md md:rounded-r-none flex items-center justify-center hover:bg-bg-muted transition-colors"
          >
            <ArrowRightIcon className="w-3.5 h-3.5 stroke-[1.8]" />
          </div>
        </div>
      </div>
    </>
  );
}

export function createShelfBooks(
  notes: { id: string; title: string; coverUrl?: string | null }[],
): BookshelfBook[] {
  return notes.map((note) => ({
    id: note.id,
    title: note.title,
    coverImage: note.coverUrl,
    ...makeBookColors(note.id),
  }));
}
