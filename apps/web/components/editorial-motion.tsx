"use client";
import Image from "next/image";
import { Pause, Play } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import styles from "./editorial-motion.module.css";
type Connection = EventTarget & { saveData?: boolean; effectiveType?: string };
function useMotionPreference() {
  const [allowed, setAllowed] = useState(false);
  useEffect(() => {
    const media = matchMedia("(prefers-reduced-motion: reduce)");
    const connection = (navigator as Navigator & { connection?: Connection }).connection;
    const update = () => setAllowed(!media.matches && !connection?.saveData && !/^(slow-)?2g$/.test(connection?.effectiveType ?? ""));
    update(); media.addEventListener("change", update); connection?.addEventListener("change", update);
    return () => { media.removeEventListener("change", update); connection?.removeEventListener("change", update); };
  }, []);
  return allowed;
}
/** Only supply a licensed HIDI campaign URL. Ambient photography is not fabric footage. */
export function AmbientHero({ videoSrc }: { videoSrc?: string }) {
  const allowed = useMotionPreference();
  const mediaRef = useRef<HTMLDivElement>(null), videoRef = useRef<HTMLVideoElement>(null);
  const [paused, setPaused] = useState(false), [visible, setVisible] = useState(true), [pageVisible, setPageVisible] = useState(true);
  const [loadVideo, setLoadVideo] = useState(false), [playing, setPlaying] = useState(false), [failed, setFailed] = useState(false);
  const source = videoSrc && (/^\/(?!\/)/.test(videoSrc) || /^https:\/\//.test(videoSrc)) ? videoSrc : undefined;
  const running = allowed && !paused && visible && pageVisible;
  useEffect(() => {
    const onVisibility = () => setPageVisible(!document.hidden);
    onVisibility(); document.addEventListener("visibilitychange", onVisibility);
    const observer = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting), { threshold: 0.05 });
    if (mediaRef.current) observer.observe(mediaRef.current);
    return () => { observer.disconnect(); document.removeEventListener("visibilitychange", onVisibility); };
  }, []);
  useEffect(() => {
    if (!running || !source || failed || loadVideo) return;
    const timer = window.setTimeout(() => setLoadVideo(true), 650);
    return () => window.clearTimeout(timer);
  }, [running, source, failed, loadVideo]);
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !loadVideo || failed) return;
    if (!running) { video.pause(); return; }
    video.muted = true; void video.play().catch(() => setPlaying(false));
  }, [running, loadVideo, failed]);
  return <>
    <div ref={mediaRef} className={styles.media} data-hidi-campaign data-motion={running ? "running" : "paused"} data-video-playing={playing && !failed}>
      <Image src="/brand/hidi-hero-green-garden-fullbody.webp" alt="HIDI garden campaign, full-length Indian wear styling" fill priority sizes="100vw" className={styles.poster} />
      {source && !failed && <video ref={videoRef} className={styles.video} src={loadVideo ? source : undefined} muted loop playsInline preload="none" aria-hidden="true" tabIndex={-1} onPlaying={() => setPlaying(true)} onError={() => { setFailed(true); setPlaying(false); }} />}
    </div>
    {allowed && <button type="button" className={styles.motionControl} data-hidi-motion-control onClick={() => setPaused(value => !value)} aria-label={paused ? "Play ambient motion" : "Pause ambient motion"} aria-pressed={paused}>{paused ? <Play size={15} aria-hidden="true" /> : <Pause size={15} aria-hidden="true" />}<span>Motion {paused ? "off" : "on"}</span></button>}
  </>;
}
const messages = ["Complimentary shipping · ₹1,499+", "7-day returns · review eligibility", "Secure checkout. Considered style."];
export function AnnouncementTicker() {
  const allowed = useMotionPreference();
  const [index, setIndex] = useState(0), [paused, setPaused] = useState(false), [interacting, setInteracting] = useState(false);
  useEffect(() => {
    if (!allowed || paused || interacting) return;
    const timer = window.setInterval(() => { if (!document.hidden) setIndex(value => (value + 1) % messages.length); }, 6000);
    return () => window.clearInterval(timer);
  }, [allowed, paused, interacting]);
  return <div className={styles.announcement} role="region" aria-label="HIDI shopping services" onMouseEnter={() => setInteracting(true)} onMouseLeave={() => setInteracting(false)} onFocusCapture={() => setInteracting(true)} onBlurCapture={() => setInteracting(false)}>
    <span key={index} className={allowed ? styles.message : undefined}>{messages[index]}</span>
    {allowed && <button type="button" onClick={() => setPaused(value => !value)} aria-label={paused ? "Play announcements" : "Pause announcements"} aria-pressed={paused}>{paused ? <Play size={12} aria-hidden="true" /> : <Pause size={12} aria-hidden="true" />}</button>}
  </div>;
}
