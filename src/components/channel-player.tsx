"use client";

import Hls from "hls.js";
import Image from "next/image";
import { Clock3, LogIn, LogOut, Maximize2, RadioTower, Volume2, VolumeX } from "lucide-react";
import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import { StreamAccessGate } from "@/components/stream-access-gate";
import { youtubeEmbedUrl } from "@/lib/media/youtube";
import type { PublicChannelStream } from "@/lib/streaming/public-channel";
import type { ApprovedStreamViewer } from "@/lib/streaming/viewer-session";

function formatTime(seconds: number) {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const whole = Math.floor(seconds);
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`;
}

function resolveTimeline(items: PublicChannelStream["items"], startedAt: string, serverTimeMs: number) {
  if (!items.length) return { index: 0, offsetSeconds: 0 };
  const totalDurationMs = items.reduce((total, item) => total + item.durationMs, 0);
  if (totalDurationMs <= 0) return { index: 0, offsetSeconds: 0 };

  const startedAtMs = Date.parse(startedAt);
  const elapsedMs = Number.isFinite(startedAtMs) ? Math.max(0, serverTimeMs - startedAtMs) : 0;
  let positionMs = elapsedMs % totalDurationMs;

  for (let index = 0; index < items.length; index += 1) {
    if (positionMs < items[index].durationMs) return { index, offsetSeconds: positionMs / 1000 };
    positionMs -= items[index].durationMs;
  }

  return { index: 0, offsetSeconds: 0 };
}

export function ChannelPlayer({ channel, accessKey, approvedViewer }: { channel: PublicChannelStream; accessKey: string; approvedViewer: ApprovedStreamViewer | null }) {
  const router = useRouter();
  const videoRef = useRef<HTMLVideoElement>(null);
  const youtubeRef = useRef<HTMLIFrameElement>(null);
  const initialPosition = resolveTimeline(channel.items, channel.broadcastStartedAt, channel.serverTimeMs);
  const [index, setIndex] = useState(initialPosition.index);
  const [muted, setMuted] = useState(true);
  const [unavailable, setUnavailable] = useState(false);
  const [sourceRevision, setSourceRevision] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const currentTimeRef = useRef(0);
  const [duration, setDuration] = useState(0);
  const [viewerAccessOpen, setViewerAccessOpen] = useState(false);
  const serverClockOffsetRef = useRef(0);
  const currentIndexRef = useRef(initialPosition.index);
  const desiredOffsetRef = useRef(initialPosition.offsetSeconds);
  const lastYoutubeSeekAtRef = useRef(0);
  const youtubePlayingRef = useRef(false);
  const qualityIntervalStartedAtRef = useRef(0);
  const startupStartedAtRef = useRef(0);
  const startupMsRef = useRef<number | null>(null);
  const bufferStartedAtRef = useRef<number | null>(null);
  const bufferCountRef = useRef(0);
  const bufferDurationMsRef = useRef(0);
  const lastHeartbeatRttMsRef = useRef<number | null>(null);
  const lastDroppedFramesRef = useRef(0);
  const lastTotalFramesRef = useRef(0);
  const item = channel.items[index];

  const markPlaybackBuffering = useCallback(() => {
    if (bufferStartedAtRef.current !== null) return;
    bufferStartedAtRef.current = performance.now();
    bufferCountRef.current += 1;
  }, []);

  const markPlaybackPlaying = useCallback(() => {
    const now = performance.now();
    if (startupMsRef.current === null && startupStartedAtRef.current > 0) startupMsRef.current = Math.round(now - startupStartedAtRef.current);
    if (bufferStartedAtRef.current !== null) {
      bufferDurationMsRef.current += now - bufferStartedAtRef.current;
      bufferStartedAtRef.current = null;
    }
  }, []);

  const estimatedServerTime = useCallback(() => {
    return Date.now() + serverClockOffsetRef.current;
  }, []);

  const sendYouTubeCommand = useCallback((func: "mute" | "unMute" | "playVideo" | "seekTo", args: Array<boolean | number> = []) => {
    youtubeRef.current?.contentWindow?.postMessage(JSON.stringify({ event: "command", func, args }), "https://www.youtube-nocookie.com");
  }, []);

  const synchronizePlayback = useCallback(() => {
    if (!channel.settings.broadcastEnabled || !channel.items.length) return;
    const target = resolveTimeline(channel.items, channel.broadcastStartedAt, estimatedServerTime());
    desiredOffsetRef.current = target.offsetSeconds;
    if (target.index !== currentIndexRef.current) {
      setIndex(target.index);
      return;
    }

    const targetItem = channel.items[target.index];
    if (targetItem.sourceType === "youtube") {
      setCurrentTime(Math.floor(target.offsetSeconds));
      setDuration(targetItem.durationMs / 1000);
      if (Date.now() - lastYoutubeSeekAtRef.current >= 15_000) {
        sendYouTubeCommand("seekTo", [target.offsetSeconds, true]);
        sendYouTubeCommand("playVideo");
        lastYoutubeSeekAtRef.current = Date.now();
      }
      return;
    }

    const video = videoRef.current;
    if (video?.readyState && Math.abs(video.currentTime - target.offsetSeconds) > 1) {
      video.currentTime = Math.min(target.offsetSeconds, Math.max(0, video.duration - 0.1));
    }
  }, [channel.broadcastStartedAt, channel.items, channel.settings.broadcastEnabled, estimatedServerTime, sendYouTubeCommand]);

  const refreshPlaylistAtMediaEnd = useCallback(() => {
    router.refresh();
    synchronizePlayback();
  }, [router, synchronizePlayback]);

  useEffect(() => {
    serverClockOffsetRef.current = channel.serverTimeMs - Date.now();
  }, [channel.serverTimeMs]);

  useEffect(() => {
    currentIndexRef.current = index;
  }, [index]);

  useEffect(() => {
    currentTimeRef.current = currentTime;
  }, [currentTime]);

  useEffect(() => {
    const now = performance.now();
    qualityIntervalStartedAtRef.current = now;
    startupStartedAtRef.current = now;
    startupMsRef.current = null;
    bufferStartedAtRef.current = null;
    bufferCountRef.current = 0;
    bufferDurationMsRef.current = 0;
    lastDroppedFramesRef.current = 0;
    lastTotalFramesRef.current = 0;
  }, [item?.id]);

  useEffect(() => {
    let cancelled = false;
    const synchronizeClock = async () => {
      const requestedAt = Date.now();
      try {
        const response = await fetch(channel.clockUrl, { cache: "no-store" });
        const receivedAt = Date.now();
        const payload = await response.json() as { serverTimeMs?: number };
        if (!cancelled && response.ok && typeof payload.serverTimeMs === "number") {
          serverClockOffsetRef.current = payload.serverTimeMs - ((requestedAt + receivedAt) / 2);
          synchronizePlayback();
        }
      } catch {
        // The server-rendered clock remains a safe fallback until the next synchronization attempt.
      }
    };
    void synchronizeClock();
    const interval = window.setInterval(synchronizeClock, 60_000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [channel.clockUrl, synchronizePlayback]);

  useEffect(() => {
    if (!channel.settings.broadcastEnabled) return;
    const interval = window.setInterval(synchronizePlayback, 5_000);
    const handleVisibility = () => { if (document.visibilityState === "visible") synchronizePlayback(); };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [channel.settings.broadcastEnabled, synchronizePlayback]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !item || item.sourceType !== "upload" || !channel.settings.broadcastEnabled) return;
    const fallbackUrl = item.fallbackUrl;
    if (!fallbackUrl) return;
    let hls: Hls | null = null;
    let usingFallback = !item.hlsUrl;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;

    const advanceOrStop = () => {
      if (channel.items.length > 1) setIndex((current) => (current + 1) % channel.items.length);
      else {
        setUnavailable(true);
        retryTimer = setTimeout(() => setSourceRevision((revision) => revision + 1), 5_000);
      }
    };
    const seekToBroadcastPoint = () => {
      setUnavailable(false);
      const target = resolveTimeline(channel.items, channel.broadcastStartedAt, estimatedServerTime());
      desiredOffsetRef.current = target.offsetSeconds;
      if (target.index !== currentIndexRef.current) return setIndex(target.index);
      video.currentTime = Math.min(target.offsetSeconds, Math.max(0, video.duration - 0.1));
      void video.play().catch(() => undefined);
    };
    const activateFallback = () => {
      if (usingFallback) return advanceOrStop();
      usingFallback = true;
      hls?.destroy();
      hls = null;
      video.src = fallbackUrl;
      void video.play().catch(advanceOrStop);
    };

    video.onerror = activateFallback;
    video.addEventListener("loadedmetadata", seekToBroadcastPoint);
    video.addEventListener("waiting", markPlaybackBuffering);
    video.addEventListener("stalled", markPlaybackBuffering);
    video.addEventListener("playing", markPlaybackPlaying);
    if (item.hlsUrl && Hls.isSupported()) {
      hls = new Hls({ enableWorker: true, lowLatencyMode: false });
      hls.on(Hls.Events.ERROR, (_event, data) => { if (data.fatal) activateFallback(); });
      hls.loadSource(item.hlsUrl);
      hls.attachMedia(video);
    } else {
      usingFallback = true;
      video.src = item.hlsUrl && video.canPlayType("application/vnd.apple.mpegurl") ? item.hlsUrl : fallbackUrl;
    }
    void video.play().catch(() => undefined);
    return () => {
      video.onerror = null;
      video.removeEventListener("loadedmetadata", seekToBroadcastPoint);
      video.removeEventListener("waiting", markPlaybackBuffering);
      video.removeEventListener("stalled", markPlaybackBuffering);
      video.removeEventListener("playing", markPlaybackPlaying);
      if (retryTimer) clearTimeout(retryTimer);
      hls?.destroy();
      video.removeAttribute("src");
      video.load();
    };
  }, [channel.broadcastStartedAt, channel.items, channel.settings.broadcastEnabled, estimatedServerTime, item, markPlaybackBuffering, markPlaybackPlaying, sourceRevision]);

  useEffect(() => {
    if (!item || item.sourceType !== "youtube" || !channel.settings.broadcastEnabled) return;
    const updateDisplayTime = () => {
      const target = resolveTimeline(channel.items, channel.broadcastStartedAt, estimatedServerTime());
      if (target.index === currentIndexRef.current) setCurrentTime(Math.floor(target.offsetSeconds));
    };
    const interval = window.setInterval(updateDisplayTime, 1_000);
    return () => window.clearInterval(interval);
  }, [channel.broadcastStartedAt, channel.items, channel.settings.broadcastEnabled, estimatedServerTime, item]);

  const handleYouTubeLoad = useCallback(() => {
    if (!item || item.sourceType !== "youtube") return;
    youtubePlayingRef.current = false;
    youtubeRef.current?.contentWindow?.postMessage(JSON.stringify({ event: "listening", id: "loopline-stream-player" }), "https://www.youtube-nocookie.com");
    const target = resolveTimeline(channel.items, channel.broadcastStartedAt, estimatedServerTime());
    sendYouTubeCommand("seekTo", [target.offsetSeconds, true]);
    sendYouTubeCommand(muted ? "mute" : "unMute");
    sendYouTubeCommand("playVideo");
    lastYoutubeSeekAtRef.current = Date.now();
    setCurrentTime(Math.floor(target.offsetSeconds));
    setDuration(item.durationMs / 1000);
  }, [channel.broadcastStartedAt, channel.items, estimatedServerTime, item, muted, sendYouTubeCommand]);

  useEffect(() => {
    if (!item || item.sourceType !== "youtube") return;
    const handleYouTubeMessage = (event: MessageEvent) => {
      if (event.origin !== "https://www.youtube-nocookie.com" || event.source !== youtubeRef.current?.contentWindow) return;
      try {
        const payload = typeof event.data === "string" ? JSON.parse(event.data) as { event?: string; info?: number } : event.data as { event?: string; info?: number };
        if (payload.event === "onReady") handleYouTubeLoad();
        if (payload.event === "onStateChange") {
          youtubePlayingRef.current = payload.info === 1;
          if (payload.info === 3) markPlaybackBuffering();
          if (payload.info === 1) markPlaybackPlaying();
          if (payload.info === 0) refreshPlaylistAtMediaEnd();
        }
        if (payload.event === "onError") setUnavailable(true);
      } catch {
        // Ignore unrelated or malformed postMessage traffic.
      }
    };
    window.addEventListener("message", handleYouTubeMessage);
    return () => window.removeEventListener("message", handleYouTubeMessage);
  }, [handleYouTubeLoad, item, markPlaybackBuffering, markPlaybackPlaying, refreshPlaylistAtMediaEnd]);

  useEffect(() => {
    if (!item || !channel.settings.broadcastEnabled || unavailable) return;
    const recordHeartbeat = async () => {
      if (document.visibilityState !== "visible") return;
      const requestStartedAt = performance.now();
      const activeBufferDuration = bufferStartedAtRef.current === null ? 0 : requestStartedAt - bufferStartedAtRef.current;
      const sampledBufferCount = bufferCountRef.current;
      const sampledBufferDuration = Math.round(bufferDurationMsRef.current + activeBufferDuration);
      const sampledStartupMs = startupMsRef.current;
      const videoQuality = item.sourceType === "upload" ? videoRef.current?.getVideoPlaybackQuality?.() : null;
      const sampledDroppedFrames = videoQuality ? Math.max(0, videoQuality.droppedVideoFrames - lastDroppedFramesRef.current) : null;
      const sampledTotalFrames = videoQuality ? Math.max(0, videoQuality.totalVideoFrames - lastTotalFramesRef.current) : null;
      const connection = (navigator as Navigator & { connection?: { rtt?: number; downlink?: number; effectiveType?: "slow-2g" | "2g" | "3g" | "4g" } }).connection;
      const response = await fetch("/api/v1/streams/heartbeat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mediaId: item.id,
          eventKey: crypto.randomUUID(),
          positionSeconds: currentTimeRef.current,
          clientEventAt: new Date().toISOString(),
          pageVisible: document.visibilityState === "visible",
          isPlaying: item.sourceType === "youtube" ? youtubePlayingRef.current : !videoRef.current?.paused,
          quality: {
            playbackType: item.sourceType,
            observedIntervalMs: Math.min(60_000, Math.max(0, Math.round(requestStartedAt - qualityIntervalStartedAtRef.current))),
            startupMs: sampledStartupMs,
            bufferCount: sampledBufferCount,
            bufferDurationMs: Math.min(60_000, sampledBufferDuration),
            heartbeatRttMs: lastHeartbeatRttMsRef.current,
            connectionRttMs: Number.isFinite(connection?.rtt) ? Math.round(connection!.rtt!) : null,
            downlinkMbps: Number.isFinite(connection?.downlink) ? connection!.downlink! : null,
            effectiveConnectionType: connection?.effectiveType ?? null,
            droppedFrames: sampledDroppedFrames,
            totalFrames: sampledTotalFrames,
          },
        }),
        keepalive: true,
      }).catch(() => null);
      if (response?.ok) {
        const completedAt = performance.now();
        lastHeartbeatRttMsRef.current = Math.round(completedAt - requestStartedAt);
        qualityIntervalStartedAtRef.current = completedAt;
        bufferCountRef.current = Math.max(0, bufferCountRef.current - sampledBufferCount);
        bufferDurationMsRef.current = Math.max(0, bufferDurationMsRef.current - Math.round(sampledBufferDuration - activeBufferDuration));
        if (bufferStartedAtRef.current !== null) bufferStartedAtRef.current = completedAt;
        if (sampledStartupMs !== null) {
          startupMsRef.current = null;
          startupStartedAtRef.current = 0;
        }
        if (videoQuality) {
          lastDroppedFramesRef.current = videoQuality.droppedVideoFrames;
          lastTotalFramesRef.current = videoQuality.totalVideoFrames;
        }
        const payload = await response.json().catch(() => null) as { credit?: { validation_result?: string } } | null;
        if (payload?.credit?.validation_result === "insufficient_credit") router.refresh();
      }
    };
    const interval = window.setInterval(recordHeartbeat, 15_000);
    return () => window.clearInterval(interval);
  }, [channel.settings.broadcastEnabled, item, router, unavailable]);

  const toggleAudio = () => {
    setMuted((current) => {
      const next = !current;
      if (item?.sourceType === "youtube") sendYouTubeCommand(next ? "mute" : "unMute");
      return next;
    });
  };

  const leaveStream = async () => {
    await fetch("/api/v1/streams/end", { method: "POST" }).catch(() => undefined);
    await document.exitFullscreen?.().catch(() => undefined);
    router.refresh();
  };

  const settings = channel.settings;
  const hasInformation = settings.showLiveBadge || settings.showChannelName || settings.showNowPlaying || (settings.showChannelDescription && Boolean(channel.description));
  const progress = duration > 0 ? Math.min(100, Math.max(0, currentTime / duration * 100)) : 0;
  const playerStyle = { "--stream-accent": settings.accentColor } as CSSProperties;
  return <main className="stream-page" style={playerStyle}>
    {item && channel.settings.broadcastEnabled ? item.sourceType === "youtube" && item.youtubeVideoId ? <iframe key={item.id} ref={youtubeRef} className={`stream-youtube stream-youtube-${settings.videoFit}`} src={youtubeEmbedUrl(item.youtubeVideoId, { autoplay: true, controls: false })} title={item.name} allow="autoplay; encrypted-media; picture-in-picture" onLoad={handleYouTubeLoad} /> : <video ref={videoRef} autoPlay muted={muted} playsInline style={{ objectFit: settings.videoFit === "cover" ? "cover" : "contain" }} onEnded={refreshPlaylistAtMediaEnd} onTimeUpdate={(event) => { const next = Math.floor(event.currentTarget.currentTime); setCurrentTime((current) => current === next ? current : next); }} onLoadedMetadata={(event) => setDuration(event.currentTarget.duration)} /> : <div className="stream-empty"><RadioTower size={38} /><p className="eyebrow">{channel.name}</p><h1>{item ? "Broadcast on standby" : "Channel is ready"}</h1><span>{item ? "The viewer link is available, but continuous playback is paused by an administrator." : "Add approved media from the Channels or Business dashboard to begin streaming."}</span></div>}
    {item && channel.settings.broadcastEnabled && settings.showStripeBanner && settings.stripeBannerText ? <div className={`stream-stripe stream-stripe-${settings.stripeBannerPosition}`}><span>{settings.stripeBannerText}</span></div> : null}
    {item && channel.settings.broadcastEnabled && settings.showAdvertiserLogo && item.logoUrl ? <div className={`stream-advertiser-logo stream-logo-${item.logoPosition}`} style={{ width: `${item.logoSizePercent}vw` }}><Image src={item.logoUrl} alt={`${item.advertiserName} logo`} width={420} height={210} unoptimized /></div> : null}
    {unavailable ? <div className="stream-playback-error" role="alert">This media is temporarily unavailable. The player will recover when the source is restored.</div> : null}
    {item && channel.settings.broadcastEnabled ? <div className={`stream-overlay stream-overlay-${settings.overlayPosition} stream-overlay-style-${settings.overlayStyle}`}>
      {hasInformation ? <div>{settings.showLiveBadge ? <span className="stream-live"><i /> Live channel</span> : null}{settings.showChannelName ? <h1>{channel.name}</h1> : null}{settings.showChannelDescription && channel.description ? <p className="stream-channel-description">{channel.description}</p> : null}{settings.showNowPlaying ? <p>Now playing: {item.name}</p> : null}</div> : <span />}
      <div className="stream-overlay-controls">{settings.showVideoTime ? <span className="stream-video-time"><Clock3 size={16} /> {formatTime(currentTime)} / {formatTime(duration)}</span> : null}{settings.showAudioControl ? <button type="button" onClick={toggleAudio}>{muted ? <VolumeX size={18} /> : <Volume2 size={18} />}{muted ? "Enable sound" : "Mute"}</button> : null}{settings.showFullscreenControl ? <button type="button" onClick={() => document.documentElement.requestFullscreen?.()}><Maximize2 size={18} /> Fullscreen</button> : null}{settings.showLeaveControl ? <button type="button" onClick={leaveStream}><LogOut size={18} /> Leave</button> : null}</div>
      {settings.showProgressBar ? <div className="stream-progress" role="progressbar" aria-label="Current advertisement progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress)}><span style={{ width: `${progress}%` }} /></div> : null}
    </div> : null}
    {settings.showViewerLogin ? <button className="stream-viewer-login-button" type="button" aria-label="Open optional viewer login" aria-expanded={viewerAccessOpen} onClick={() => setViewerAccessOpen(true)}><LogIn size={20} /></button> : null}
    <StreamAccessGate channelId={channel.publicId} accessKey={accessKey} channelName={channel.name} approvedViewer={approvedViewer} open={viewerAccessOpen} onClose={() => setViewerAccessOpen(false)} />
  </main>;
}
