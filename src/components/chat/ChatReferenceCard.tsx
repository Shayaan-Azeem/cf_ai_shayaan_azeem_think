import { invoke } from "@tauri-apps/api/core";
import { type ReactNode, useEffect, useState } from "react";
import { ExternalLinkIcon, NoteIcon } from "../icons";
import { cleanTitle } from "../../lib/utils";
import type { ChatReferenceItem } from "./chat-tools";

interface ChatReferenceCardProps {
  reference: ChatReferenceItem;
  onOpenNote: (id: string) => void;
}

function parseIconCover(
  coverUrl: string | null | undefined,
): { symbol: string; color: string } | null {
  if (!coverUrl?.startsWith("icon:")) return null;
  const parts = coverUrl.slice(5).split(":");
  if (parts.length === 2) return { symbol: parts[0], color: parts[1] };
  if (parts.length === 1) return { symbol: "", color: parts[0] };
  return null;
}

function openExternalUrl(url: string) {
  void invoke("open_url_safe", { url }).catch((error) => {
    console.error("[chat] Failed to open referenced URL:", error);
  });
}

function hashString(value: string): number {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(index);
    hash |= 0;
  }
  return Math.abs(hash);
}

function makeBookColors(id: string) {
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
        if (!ctx) {
          resolve(null);
          return;
        }
        ctx.drawImage(img, 0, 0, 4, sampleH, 0, 0, 1, sampleH);
        const data = ctx.getImageData(0, 0, 1, sampleH).data;
        let r = 0;
        let g = 0;
        let b = 0;
        let count = 0;
        for (let index = 0; index < data.length; index += 4) {
          r += data[index];
          g += data[index + 1];
          b += data[index + 2];
          count += 1;
        }
        if (count === 0) {
          resolve(null);
          return;
        }
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

function useBookSpineColor(coverUrl: string | null): string | null {
  const [spineColor, setSpineColor] = useState<string | null>(() => {
    if (!coverUrl) return null;
    return spineColorCache.get(coverUrl) ?? null;
  });

  useEffect(() => {
    let cancelled = false;
    if (!coverUrl) {
      setSpineColor(null);
      return;
    }
    extractSpineColor(coverUrl).then((color) => {
      if (!cancelled && color) setSpineColor(color);
    });
    return () => {
      cancelled = true;
    };
  }, [coverUrl]);

  return spineColor;
}

function ActionButtons({
  reference,
  onOpenNote,
}: ChatReferenceCardProps) {
  return (
    <div className="mt-1.5 flex items-center gap-2">
      <button
        type="button"
        onClick={() => onOpenNote(reference.id)}
        className="px-2 py-1 text-[11px] font-medium text-text hover:bg-bg-muted transition-colors"
      >
        Open note
      </button>
      {reference.linkUrl ? (
        <button
          type="button"
          onClick={() => openExternalUrl(reference.linkUrl!)}
          className="inline-flex items-center gap-1 px-2 py-1 text-[11px] text-text-muted hover:bg-bg hover:text-text transition-colors"
        >
          <ExternalLinkIcon className="h-3 w-3" />
          Open link
        </button>
      ) : null}
    </div>
  );
}

function BookThumbnail({ reference }: { reference: ChatReferenceItem }) {
  const colors = makeBookColors(reference.id);
  const derivedSpineColor = useBookSpineColor(reference.coverUrl);

  return (
    <div className="pointer-events-none relative flex shrink-0 text-left">
      <svg
        style={{
          position: "absolute",
          inset: 0,
          visibility: "hidden",
          pointerEvents: "none",
        }}
      >
        <defs>
          <filter id="chat-book-paper" x="0%" y="0%" width="100%" height="100%">
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
      <div
        className="relative h-[74px] w-[14px] shrink-0"
        style={{
          backgroundColor: derivedSpineColor || colors.spineColor,
          color: colors.textColor,
          transform: "translate3d(0px, 0px, 0px) scale3d(1, 1, 1) rotateX(0deg) rotateY(-60deg) rotateZ(0deg) skew(0deg, 0deg)",
          transformOrigin: "right",
          filter: "brightness(0.8) contrast(2)",
          transformStyle: "preserve-3d",
        }}
      >
        <span
          style={{
            pointerEvents: "none",
            position: "absolute",
            top: 0,
            left: 0,
            zIndex: 40,
            height: "74px",
            width: "14px",
            opacity: 0.4,
            filter: "url(#chat-book-paper)",
          }}
        />
        <div
          className="absolute inset-0 opacity-30"
          style={{
            background:
              "linear-gradient(to bottom, rgba(255,255,255,0.25), transparent 18%, transparent 82%, rgba(0,0,0,0.15))",
          }}
        />
        <div
          className="absolute inset-x-0 top-1.5 overflow-hidden px-[2px] text-center text-[7px] font-semibold tracking-[0.06em] leading-tight"
          style={{
            writingMode: "vertical-rl",
            textOrientation: "mixed",
            maxHeight: "60px",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {cleanTitle(reference.title)}
        </div>
      </div>
      <div
        className="relative h-[74px] w-[48px] overflow-hidden"
        style={{
          transform: "translate3d(0px, 0px, 0px) scale3d(1, 1, 1) rotateX(0deg) rotateY(30deg) rotateZ(0deg) skew(0deg, 0deg)",
          transformOrigin: "left",
          background: reference.coverUrl ? undefined : colors.coverBackground,
          filter: "brightness(0.8) contrast(2)",
          transformStyle: "preserve-3d",
        }}
      >
        <span
          style={{
            pointerEvents: "none",
            position: "absolute",
            top: 0,
            right: 0,
            zIndex: 40,
            height: "74px",
            width: "48px",
            opacity: 0.4,
            filter: "url(#chat-book-paper)",
          }}
        />
        {reference.coverUrl ? (
          <img
            src={reference.coverUrl}
            alt=""
            className="h-full w-full object-cover"
            loading="lazy"
          />
        ) : (
          <div className="flex h-full items-end p-2">
            <div className="line-clamp-3 text-[9px] font-medium text-white/90">
              {cleanTitle(reference.title)}
            </div>
          </div>
        )}
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "linear-gradient(to right, rgba(255, 255, 255, 0) 2px, rgba(255, 255, 255, 0.5) 3px, rgba(255, 255, 255, 0.25) 4px, rgba(255, 255, 255, 0.25) 6px, transparent 7px, transparent 9px, rgba(255, 255, 255, 0.25) 9px, transparent 12px)",
          }}
        />
      </div>
    </div>
  );
}

function GenericThumbnail({ reference }: { reference: ChatReferenceItem }) {
  const iconCover = parseIconCover(reference.coverUrl);
  const isImageCover = reference.coverUrl && !iconCover;
  const baseClass = "mt-0.5 h-[60px] w-[60px] shrink-0 object-cover";

  if (iconCover) {
    return (
      <div
        className="mt-0.5 flex h-[60px] w-[60px] shrink-0 items-center justify-center rounded-md text-base"
        style={{ backgroundColor: iconCover.color }}
      >
        {iconCover.symbol || <NoteIcon className="h-4 w-4 text-white/90" />}
      </div>
    );
  }

  if (isImageCover) {
    return (
      <img
        src={reference.coverUrl!}
        alt=""
        className={`${baseClass} rounded-md`}
        loading="lazy"
      />
    );
  }

  return (
    <div className="mt-0.5 flex h-[60px] w-[60px] shrink-0 items-center justify-center rounded-md bg-bg-muted text-text-muted">
      <NoteIcon className="h-4 w-4" />
    </div>
  );
}

function CompactReferenceCard({
  reference,
  onOpenNote,
  thumbnail,
}: ChatReferenceCardProps & { thumbnail: ReactNode }) {
  const subtitle = [reference.author, reference.publication, reference.publishedAt]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="min-h-[80px] py-1">
      <div className="flex items-start gap-3">
        <button
          type="button"
          onClick={() => onOpenNote(reference.id)}
          className="shrink-0"
          aria-label={`Open ${cleanTitle(reference.title)}`}
        >
          {thumbnail}
        </button>
        <div className="min-w-0 flex-1 pt-0.5">
          <button
            type="button"
            onClick={() => onOpenNote(reference.id)}
            className="block text-left text-sm font-semibold leading-snug text-text hover:underline line-clamp-2"
          >
            {cleanTitle(reference.title)}
          </button>
          {subtitle ? (
            <div className="mt-0.5 text-xs text-text-muted line-clamp-1">
              {subtitle}
            </div>
          ) : null}
          <ActionButtons reference={reference} onOpenNote={onOpenNote} />
        </div>
      </div>
    </div>
  );
}

export function ChatReferenceCard({
  reference,
  onOpenNote,
}: ChatReferenceCardProps) {
  if (reference.cardKind === "book") {
    return (
      <CompactReferenceCard
        reference={reference}
        onOpenNote={onOpenNote}
        thumbnail={<BookThumbnail reference={reference} />}
      />
    );
  }

  return (
    <CompactReferenceCard
      reference={reference}
      onOpenNote={onOpenNote}
      thumbnail={<GenericThumbnail reference={reference} />}
    />
  );
}
