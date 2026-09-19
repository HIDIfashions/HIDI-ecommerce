"use client";

import Image from "next/image";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { PointerEvent as ReactPointerEvent } from "react";
import { Expand, Play, X } from "lucide-react";
import { buildCardMedia, swipeStep, wrapMediaIndex } from "@/lib/product-card-media-utils";
import type { CardImage, CardMedia, CardVideo } from "@/lib/product-card-media-utils";
import styles from "./product-card-media.module.css";

const VIDEO_PLAY_EVENT = "hidi-card-video-play";
const EMPTY_VIDEOS: readonly CardVideo[] = [];
const DEFAULT_INTERVAL = 1800;

type Props = {
  name: string;
  images: readonly CardImage[];
  videos?: readonly CardVideo[];
  soldOut?: boolean;
  intervalMs?: number;
  href: string;
};

/**
 * Minimal HIDI collection-card gallery.
 * - Desktop: only the product under the cursor loops through its photos.
 * - Products that are not hovered remain static.
 * - Mobile customers can still swipe horizontally.
 * - Clicking the photo opens product details; the expand control opens the lightbox.
 * - Videos never autoplay and require a customer gesture.
 */
export function ProductCardMedia({ name, images, videos = EMPTY_VIDEOS, ...rest }: Props) {
  const items = useMemo(() => buildCardMedia(name, images, videos), [name, images, videos]);
  const signature = JSON.stringify(items);
  return <Gallery key={signature} name={name} items={items} {...rest} />;
}

function Photo({ src, alt, sizes, contain = false, ready }: {
  src?: string;
  alt: string;
  sizes: string;
  contain?: boolean;
  ready?: () => void;
}) {
  const [failed, setFailed] = useState(false);

  if (!src || failed) {
    return (
      <span className={styles.fallback} role="img" aria-label={`${alt} — image unavailable`}>
        <span aria-hidden="true">H</span>
        <small>HIDI · Photo unavailable</small>
      </span>
    );
  }

  return (
    <Image
      src={src}
      alt={alt}
      fill
      sizes={sizes}
      loading="lazy"
      draggable={false}
      className={contain ? styles.contain : styles.photo}
      onLoad={() => ready?.()}
      onError={() => {
        setFailed(true);
        ready?.();
      }}
    />
  );
}

function InlineVideo({ item, owner }: {
  item: Extract<CardMedia, { kind: "video" }>;
  owner: string;
}) {
  const ref = useRef<HTMLVideoElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const [requested, setRequested] = useState(false);
  const [message, setMessage] = useState("");
  const [failed, setFailed] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [buffering, setBuffering] = useState(false);

  useEffect(() => {
    const node = ref.current;
    const pause = () => {
      if (node && !node.paused) node.pause();
    };

    const onOtherVideo = (event: Event) => {
      if ((event as CustomEvent<string>).detail !== owner) pause();
    };

    const visibility = () => {
      if (document.hidden) pause();
    };

    window.addEventListener(VIDEO_PLAY_EVENT, onOtherVideo);
    document.addEventListener("visibilitychange", visibility);

    const observer = typeof IntersectionObserver !== "undefined"
      ? new IntersectionObserver(([entry]) => {
          if (!entry.isIntersecting || entry.intersectionRatio < 0.15) pause();
        }, { threshold: [0, 0.15] })
      : null;

    if (box.current) observer?.observe(box.current);

    return () => {
      observer?.disconnect();
      pause();
      window.removeEventListener(VIDEO_PLAY_EVENT, onOtherVideo);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [owner]);

  async function play() {
    const node = ref.current;
    if (!node) return;

    setMessage("");
    setFailed(false);
    setRequested(true);
    setBuffering(true);

    // Keep collection pages light: the video URL is attached only after a customer gesture.
    if (!node.getAttribute("src")) {
      node.src = item.url;
      node.load();
    }

    try {
      await node.play();
    } catch {
      setBuffering(false);
      setMessage("Video could not start. Tap play to retry.");
    }
  }

  return (
    <div className={styles.videoBox} ref={box}>
      {!requested && item.poster && (
        <Photo src={item.poster} alt="" sizes="(max-width:720px) 50vw, 33vw" />
      )}

      <video
        ref={ref}
        className={styles.video}
        muted
        playsInline
        preload="none"
        controls={requested && !failed}
        aria-label={item.label}
        onPlay={() => {
          setPlaying(true);
          setBuffering(false);
          setMessage("");
          window.dispatchEvent(new CustomEvent(VIDEO_PLAY_EVENT, { detail: owner }));
        }}
        onPause={() => {
          setPlaying(false);
          setBuffering(false);
        }}
        onEnded={() => setPlaying(false)}
        onWaiting={() => setBuffering(true)}
        onPlaying={() => setBuffering(false)}
        onError={() => {
          setFailed(true);
          setPlaying(false);
          setBuffering(false);
          setMessage("Video unavailable. Please try again.");
        }}
      >
        {requested && item.captionsUrl && (
          <track kind="captions" src={item.captionsUrl} srcLang="en" label="English" default />
        )}
      </video>

      {!requested && (
        <button
          type="button"
          className={styles.playCover}
          onClick={play}
          aria-label={`Play ${item.label}`}
        >
          <span className={styles.playDisc}>
            <Play size={24} fill="currentColor" aria-hidden="true" />
          </span>
        </button>
      )}

      {requested && !playing && !failed && (
        <button type="button" className={styles.resume} onClick={play} aria-label={`Play ${item.label}`}>
          <Play size={16} aria-hidden="true" />
          {buffering ? "Loading…" : "Play video"}
        </button>
      )}

      {failed && (
        <div className={styles.videoError}>
          <p role="status">{message}</p>
          <button
            type="button"
            onClick={() => {
              ref.current?.removeAttribute("src");
              void play();
            }}
          >
            Retry video
          </button>
        </div>
      )}

      {!failed && message && <p className={styles.videoMessage} role="status">{message}</p>}
    </div>
  );
}

function Gallery({
  name,
  items,
  soldOut = false,
  intervalMs = DEFAULT_INTERVAL,
  href,
}: {
  name: string;
  items: CardMedia[];
  soldOut?: boolean;
  intervalMs?: number;
  href: string;
}) {
  const id = useId();
  const router = useRouter();
  const root = useRef<HTMLDivElement>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const expandButton = useRef<HTMLButtonElement>(null);
  const gesture = useRef<{ x: number; y: number; id: number } | null>(null);
  const suppressedClickUntil = useRef(0);

  const [index, setIndex] = useState(0);
  const [hover, setHover] = useState(false);
  const [visible, setVisible] = useState(false);
  const [pageVisible, setPageVisible] = useState(true);
  const [reduceMotion, setReduceMotion] = useState(true);
  const [saveData, setSaveData] = useState(false);
  const [loaded, setLoaded] = useState("");
  const [expanded, setExpanded] = useState(false);
  const [announcement, setAnnouncement] = useState("");

  const active = items[index];
  const interval = Number.isFinite(intervalMs) ? Math.max(1400, intervalMs) : DEFAULT_INTERVAL;

  const imageIndexes = useMemo(
    () => items.flatMap((item, itemIndex) => item.kind === "image" ? [itemIndex] : []),
    [items],
  );

  // Only the hovered card rotates. Non-hovered cards remain still.
  // Rotation is photo-only; videos never autoplay or interrupt the loop.
  const rotating = imageIndexes.length > 1
    && active?.kind === "image"
    && !reduceMotion
    && !saveData
    && visible
    && pageVisible
    && !expanded
    && hover;

  useEffect(() => {
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const connection = (navigator as Navigator & {
      connection?: EventTarget & { saveData?: boolean };
    }).connection;

    const syncPreferences = () => {
      setReduceMotion(motion.matches);
      setSaveData(Boolean(connection?.saveData));
    };

    const syncPage = () => setPageVisible(!document.hidden);

    syncPreferences();
    syncPage();

    motion.addEventListener("change", syncPreferences);
    connection?.addEventListener("change", syncPreferences);
    document.addEventListener("visibilitychange", syncPage);

    const observer = typeof IntersectionObserver !== "undefined"
      ? new IntersectionObserver(([entry]) => {
          setVisible(entry.isIntersecting && entry.intersectionRatio >= 0.15);
        }, { threshold: [0, 0.15] })
      : null;

    if (root.current) observer?.observe(root.current);
    if (!observer) setVisible(true);

    return () => {
      observer?.disconnect();
      motion.removeEventListener("change", syncPreferences);
      connection?.removeEventListener("change", syncPreferences);
      document.removeEventListener("visibilitychange", syncPage);
    };
  }, []);

  useEffect(() => {
    if (!rotating || loaded !== active?.id) return;

    const timer = window.setTimeout(() => {
      setIndex(current => {
        const currentImagePosition = imageIndexes.indexOf(current);
        const nextImagePosition = currentImagePosition < 0
          ? 0
          : (currentImagePosition + 1) % imageIndexes.length;
        return imageIndexes[nextImagePosition] ?? current;
      });
    }, interval);

    return () => window.clearTimeout(timer);
  }, [rotating, loaded, active?.id, interval, imageIndexes]);

  useEffect(() => {
    if (!expanded || !dialog.current) return;

    const node = dialog.current;
    node.showModal();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      if (node.open) node.close();
      document.body.style.overflow = previousOverflow;
    };
  }, [expanded]);

  function choose(next: number) {
    const target = wrapMediaIndex(next, items.length);
    setIndex(target);
    if (items[target]) {
      setAnnouncement(`${items[target].kind === "image" ? "Photo" : "Video"} ${target + 1} of ${items.length}: ${items[target].label}`);
    }
  }

  function openPhoto() {
    if (active?.kind !== "image") return;
    setExpanded(true);
  }

  function openProduct() {
    if (Date.now() < suppressedClickUntil.current || active?.kind !== "image") return;
    router.push(href);
  }

  function closePhoto() {
    setExpanded(false);
    expandButton.current?.focus({ preventScroll: true });
  }

  function pointerDown(event: ReactPointerEvent<HTMLButtonElement>) {
    if (event.pointerType === "mouse" || !event.isPrimary) return;
    gesture.current = { x: event.clientX, y: event.clientY, id: event.pointerId };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function pointerUp(event: ReactPointerEvent<HTMLButtonElement>) {
    const start = gesture.current;
    gesture.current = null;
    if (!start || start.id !== event.pointerId) return;

    const dx = event.clientX - start.x;
    const dy = event.clientY - start.y;

    if (Math.abs(dx) > 12 || Math.abs(dy) > 12) {
      suppressedClickUntil.current = Date.now() + 500;
    }

    const step = swipeStep(dx, dy);
    if (step) choose(index + step);
  }

  return (
    <div
      className={styles.gallery}
      ref={root}
      role="group"
      aria-roledescription="carousel"
      aria-label={`${name} product media`}
    >
      <div
        className={styles.stage}
        onPointerEnter={event => {
          if (
            event.pointerType === "mouse"
            && window.matchMedia("(hover:hover) and (pointer:fine)").matches
          ) {
            setHover(true);
          }
        }}
        onPointerLeave={() => setHover(false)}
      >
        <div
          className={styles.slide}
          role="group"
          aria-roledescription="slide"
          aria-label={`${index + 1} of ${items.length || 1}`}
        >
          {active?.kind === "video" ? (
            <InlineVideo key={active.id} item={active} owner={id} />
          ) : (
            <div className={styles.photoArea}>
              <button
                type="button"
                className={styles.photoButton}
                disabled={!active}
                onClick={openProduct}
                aria-label={`View details for ${name}`}
                onPointerDown={pointerDown}
                onPointerUp={pointerUp}
                onPointerCancel={() => {
                  gesture.current = null;
                  suppressedClickUntil.current = Date.now() + 500;
                }}
              >
                <Photo
                  key={active?.id ?? "empty"}
                  src={active?.url}
                  alt={active?.label ?? name}
                  sizes="(max-width:720px) 50vw, (max-width:1100px) 33vw, 25vw"
                  ready={() => setLoaded(active?.id ?? "")}
                />
              </button>

              {active && (
                <button
                  type="button"
                  ref={expandButton}
                  className={styles.expandIcon}
                  onClick={(event) => {
                    event.stopPropagation();
                    openPhoto();
                  }}
                  aria-label={`Expand ${active.label}`}
                  title="Enlarge photo"
                >
                  <Expand size={17} aria-hidden="true" />
                </button>
              )}
            </div>
          )}
        </div>

        {soldOut && <span className={styles.badge}>Sold out</span>}
      </div>

      <p className={styles.srOnly} role="status" aria-live={rotating ? "off" : "polite"}>
        {announcement}
      </p>

      {expanded && active?.kind === "image" && (
        <dialog
          ref={dialog}
          className={styles.lightbox}
          aria-label={`${name} enlarged photo`}
          onCancel={event => {
            event.preventDefault();
            closePhoto();
          }}
          onClick={event => {
            if (event.target === event.currentTarget) closePhoto();
          }}
        >
          <div className={styles.lightboxInner}>
            <button
              type="button"
              className={styles.close}
              onClick={closePhoto}
              autoFocus
              aria-label="Close enlarged photo"
            >
              <X size={24} aria-hidden="true" />
            </button>
            <div className={styles.largePhoto}>
              <Photo key={active.id} src={active.url} alt={active.label} sizes="90vw" contain />
            </div>
          </div>
        </dialog>
      )}
    </div>
  );
}
