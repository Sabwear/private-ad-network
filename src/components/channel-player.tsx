"use client";

import Hls from "hls.js";
import Image from "next/image";
import { CheckCircle2, Clock3, LoaderCircle, LogIn, LogOut, Maximize2, Menu, RadioTower, Settings2, Volume2, VolumeX, X } from "lucide-react";
import { useActionState, useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { updateChannelDisplaySettings, type ChannelActionState } from "@/app/(platform)/channels/actions";
import type { ChannelDisplaySettings } from "@/components/channel-display-settings-fields";
import { StreamAccessGate } from "@/components/stream-access-gate";
import { youtubeEmbedUrl } from "@/lib/media/youtube";
import type { PublicChannelStream } from "@/lib/streaming/public-channel";
import type { ApprovedStreamViewer } from "@/lib/streaming/viewer-session";

const initialActionState: ChannelActionState = { status: "idle", message: "" };
const toggleFields: Array<[keyof ChannelDisplaySettings, string]> = [
  ["broadcastEnabled", "Continuous broadcast"],
  ["showLiveBadge", "Live channel badge"],
  ["showChannelName", "Channel name"],
  ["showNowPlaying", "Now playing information"],
  ["showAudioControl", "Audio control"],
  ["showAdvertiserLogo", "Advertiser logos"],
  ["showStripeBanner", "Stripe banner"],
  ["showVideoTime", "Video time"],
];

function fieldName(key: keyof ChannelDisplaySettings) {
  return key.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
}

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

export function ChannelPlayer({ channel, canAdminister, accessKey, approvedViewer }: { channel: PublicChannelStream; canAdminister: boolean; accessKey: string; approvedViewer: ApprovedStreamViewer | null }) {
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
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [viewerAccessOpen, setViewerAccessOpen] = useState(false);
  const [settings, setSettings] = useState(channel.settings);
  const [actionState, action, pending] = useActionState(updateChannelDisplaySettings, initialActionState);
  const serverClockOffsetRef = useRef(0);
  const currentIndexRef = useRef(initialPosition.index);
  const desiredOffsetRef = useRef(initialPosition.offsetSeconds);
  const lastYoutubeSeekAtRef = useRef(0);
  const youtubePlayingRef = useRef(false);
  const item = channel.items[index];

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
    if (actionState.status === "success") router.refresh();
  }, [actionState, router]);

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
      if (retryTimer) clearTimeout(retryTimer);
      hls?.destroy();
      video.removeAttribute("src");
      video.load();
    };
  }, [channel.broadcastStartedAt, channel.items, channel.settings.broadcastEnabled, estimatedServerTime, item, sourceRevision]);

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
        if (payload.event === "onStateChange") youtubePlayingRef.current = payload.info === 1;
        if (payload.event === "onError") setUnavailable(true);
      } catch {
        // Ignore unrelated or malformed postMessage traffic.
      }
    };
    window.addEventListener("message", handleYouTubeMessage);
    return () => window.removeEventListener("message", handleYouTubeMessage);
  }, [handleYouTubeLoad, item]);

  useEffect(() => {
    if (!item || !channel.settings.broadcastEnabled || unavailable) return;
    const recordHeartbeat = async () => {
      if (document.visibilityState !== "visible") return;
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
        }),
        keepalive: true,
      }).catch(() => null);
      if (response?.ok) {
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

  const hasInformation = settings.showLiveBadge || settings.showChannelName || settings.showNowPlaying;
  return <main className="stream-page">
    {item && channel.settings.broadcastEnabled ? item.sourceType === "youtube" && item.youtubeVideoId ? <iframe key={item.id} ref={youtubeRef} className={`stream-youtube stream-youtube-${settings.videoFit}`} src={youtubeEmbedUrl(item.youtubeVideoId, { autoplay: true, controls: false })} title={item.name} allow="autoplay; encrypted-media; picture-in-picture" onLoad={handleYouTubeLoad} /> : <video ref={videoRef} autoPlay muted={muted} playsInline style={{ objectFit: settings.videoFit === "cover" ? "cover" : "contain" }} onEnded={synchronizePlayback} onTimeUpdate={(event) => { const next = Math.floor(event.currentTarget.currentTime); setCurrentTime((current) => current === next ? current : next); }} onLoadedMetadata={(event) => setDuration(event.currentTarget.duration)} /> : <div className="stream-empty"><RadioTower size={38} /><p className="eyebrow">{channel.name}</p><h1>{item ? "Broadcast on standby" : "Channel is ready"}</h1><span>{item ? "The viewer link is available, but continuous playback is paused by an administrator." : "Add approved media from the Channels or Business dashboard to begin streaming."}</span></div>}
    {item && channel.settings.broadcastEnabled && settings.showStripeBanner && settings.stripeBannerText ? <div className={`stream-stripe stream-stripe-${settings.stripeBannerPosition}`}><span>{settings.stripeBannerText}</span></div> : null}
    {item && channel.settings.broadcastEnabled && settings.showAdvertiserLogo && item.logoUrl ? <div className={`stream-advertiser-logo stream-logo-${item.logoPosition}${canAdminister ? " stream-logo-admin" : ""}`} style={{ width: `${item.logoSizePercent}vw` }}><Image src={item.logoUrl} alt={`${item.advertiserName} logo`} width={420} height={210} unoptimized /></div> : null}
    {unavailable ? <div className="stream-playback-error" role="alert">This media is temporarily unavailable. The player will recover when the source is restored.</div> : null}
    {item && channel.settings.broadcastEnabled ? <div className="stream-overlay">
      {hasInformation ? <div>{settings.showLiveBadge ? <span className="stream-live"><i /> Live channel</span> : null}{settings.showChannelName ? <h1>{channel.name}</h1> : null}{settings.showNowPlaying ? <p>Now playing: {item.name}</p> : null}</div> : <span />}
      <div className="stream-overlay-controls">{settings.showVideoTime ? <span className="stream-video-time"><Clock3 size={16} /> {formatTime(currentTime)} / {formatTime(duration)}</span> : null}{settings.showAudioControl ? <button type="button" onClick={toggleAudio}>{muted ? <VolumeX size={18} /> : <Volume2 size={18} />}{muted ? "Enable sound" : "Mute"}</button> : null}<button type="button" onClick={() => document.documentElement.requestFullscreen?.()}><Maximize2 size={18} /> Fullscreen</button><button type="button" onClick={leaveStream}><LogOut size={18} /> Leave</button></div>
    </div> : null}
    <button className="stream-viewer-login-button" style={{ right: canAdminister ? 74 : 20 }} type="button" aria-label="Open optional viewer login" aria-expanded={viewerAccessOpen} onClick={() => setViewerAccessOpen(true)}><LogIn size={20} /></button>
    <StreamAccessGate channelId={channel.publicId} accessKey={accessKey} channelName={channel.name} approvedViewer={approvedViewer} open={viewerAccessOpen} onClose={() => setViewerAccessOpen(false)} />
    {canAdminister ? <><button className="stream-settings-button" type="button" aria-label="Open stream settings" aria-expanded={settingsOpen} onClick={() => setSettingsOpen((open) => !open)}>{settingsOpen ? <X size={20} /> : <Menu size={20} />}</button>{settingsOpen ? <aside className="stream-settings-panel" aria-label="Stream settings"><header><div><Settings2 size={17} /><span><strong>Video settings</strong><small>Administrator controls</small></span></div><button type="button" aria-label="Close stream settings" onClick={() => setSettingsOpen(false)}><X size={17} /></button></header><form action={action}>
      <input type="hidden" name="channelPublicId" value={channel.publicId} />
      {actionState.message ? <div className={`auth-message auth-message-${actionState.status}`} role={actionState.status === "error" ? "alert" : "status"}>{actionState.status === "success" ? <CheckCircle2 size={14} /> : <Settings2 size={14} />}<span>{actionState.message}</span></div> : null}
      <div className="stream-broadcast-summary"><RadioTower size={16} /><span><strong>{channel.settings.broadcastEnabled ? "Broadcast clock running" : "Broadcast on standby"}</strong><small>All viewers join the same point in the channel loop.</small></span></div>
      <div className="stream-setting-toggles">{toggleFields.map(([key, label]) => <label key={key}><input type="checkbox" name={fieldName(key)} checked={Boolean(settings[key])} onChange={(event) => setSettings((current) => ({ ...current, [key]: event.target.checked }))} /><span>{label}</span></label>)}</div>
      <label><span>Stripe banner text</span><input name="stripe-banner-text" maxLength={240} value={settings.stripeBannerText} onChange={(event) => setSettings((current) => ({ ...current, stripeBannerText: event.target.value }))} /></label>
      <label><span>Stripe position</span><select name="stripe-banner-position" value={settings.stripeBannerPosition} onChange={(event) => setSettings((current) => ({ ...current, stripeBannerPosition: event.target.value }))}><option value="top">Top</option><option value="bottom">Bottom</option></select></label>
      <label><span>Video scaling</span><select name="video-fit" value={settings.videoFit} onChange={(event) => setSettings((current) => ({ ...current, videoFit: event.target.value }))}><option value="contain">Fit full video</option><option value="cover">Fill screen and crop</option></select></label>
      <button className="stream-settings-save" type="submit" disabled={pending}>{pending ? <LoaderCircle className="auth-spinner" size={15} /> : <Settings2 size={15} />}{pending ? "Saving…" : "Save stream settings"}</button>
    </form></aside> : null}</> : null}
  </main>;
}
