"use client";

import Hls from "hls.js";
import Image from "next/image";
import { CheckCircle2, Clock3, LoaderCircle, Menu, RadioTower, Settings2, Volume2, VolumeX, X } from "lucide-react";
import { useActionState, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { updateChannelDisplaySettings, type ChannelActionState } from "@/app/(platform)/channels/actions";
import type { ChannelDisplaySettings } from "@/components/channel-display-settings-fields";
import type { PublicChannelStream } from "@/lib/streaming/public-channel";

const initialActionState: ChannelActionState = { status: "idle", message: "" };
const toggleFields: Array<[keyof ChannelDisplaySettings, string]> = [
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

export function ChannelPlayer({ channel, canAdminister }: { channel: PublicChannelStream; canAdminister: boolean }) {
  const router = useRouter();
  const videoRef = useRef<HTMLVideoElement>(null);
  const [index, setIndex] = useState(0);
  const [muted, setMuted] = useState(true);
  const [unavailable, setUnavailable] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settings, setSettings] = useState(channel.settings);
  const [actionState, action, pending] = useActionState(updateChannelDisplaySettings, initialActionState);
  const item = channel.items[index];

  useEffect(() => {
    if (actionState.status === "success") router.refresh();
  }, [actionState.status, router]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !item) return;
    let hls: Hls | null = null;
    let usingFallback = !item.hlsUrl;
    setUnavailable(false);
    setCurrentTime(0);
    setDuration(0);

    const advanceOrStop = () => {
      if (channel.items.length > 1) setIndex((current) => (current + 1) % channel.items.length);
      else setUnavailable(true);
    };
    const activateFallback = () => {
      if (usingFallback) return advanceOrStop();
      usingFallback = true;
      hls?.destroy();
      hls = null;
      video.src = item.fallbackUrl;
      void video.play().catch(advanceOrStop);
    };

    video.onerror = activateFallback;
    if (item.hlsUrl && Hls.isSupported()) {
      hls = new Hls({ enableWorker: true, lowLatencyMode: false });
      hls.on(Hls.Events.ERROR, (_event, data) => { if (data.fatal) activateFallback(); });
      hls.loadSource(item.hlsUrl);
      hls.attachMedia(video);
    } else {
      usingFallback = true;
      video.src = item.hlsUrl && video.canPlayType("application/vnd.apple.mpegurl") ? item.hlsUrl : item.fallbackUrl;
    }
    void video.play().catch(() => undefined);
    return () => {
      video.onerror = null;
      hls?.destroy();
      video.removeAttribute("src");
      video.load();
    };
  }, [channel.items.length, item]);

  if (!item) return <main className="stream-page"><div className="stream-empty"><RadioTower size={38} /><p className="eyebrow">{channel.name}</p><h1>Channel is ready</h1><span>Add approved media from the Channels or Business dashboard to begin streaming.</span></div></main>;

  const hasInformation = settings.showLiveBadge || settings.showChannelName || settings.showNowPlaying;
  return <main className="stream-page">
    <video ref={videoRef} autoPlay muted={muted} playsInline style={{ objectFit: settings.videoFit === "cover" ? "cover" : "contain" }} onEnded={() => setIndex((current) => (current + 1) % channel.items.length)} onTimeUpdate={(event) => { const next = Math.floor(event.currentTarget.currentTime); setCurrentTime((current) => current === next ? current : next); }} onLoadedMetadata={(event) => setDuration(event.currentTarget.duration)} />
    {settings.showStripeBanner && settings.stripeBannerText ? <div className={`stream-stripe stream-stripe-${settings.stripeBannerPosition}`}><span>{settings.stripeBannerText}</span></div> : null}
    {settings.showAdvertiserLogo && item.logoUrl ? <div className={`stream-advertiser-logo stream-logo-${item.logoPosition}${canAdminister ? " stream-logo-admin" : ""}`} style={{ width: `${item.logoSizePercent}vw` }}><Image src={item.logoUrl} alt={`${item.advertiserName} logo`} width={420} height={210} unoptimized /></div> : null}
    {unavailable ? <div className="stream-playback-error" role="alert">This media is temporarily unavailable. The player will recover when the source is restored.</div> : null}
    {hasInformation || settings.showAudioControl || settings.showVideoTime ? <div className="stream-overlay">
      {hasInformation ? <div>{settings.showLiveBadge ? <span className="stream-live"><i /> Live channel</span> : null}{settings.showChannelName ? <h1>{channel.name}</h1> : null}{settings.showNowPlaying ? <p>Now playing: {item.name}</p> : null}</div> : <span />}
      <div className="stream-overlay-controls">{settings.showVideoTime ? <span className="stream-video-time"><Clock3 size={16} /> {formatTime(currentTime)} / {formatTime(duration)}</span> : null}{settings.showAudioControl ? <button type="button" onClick={() => setMuted((current) => !current)}>{muted ? <VolumeX size={18} /> : <Volume2 size={18} />}{muted ? "Enable sound" : "Mute"}</button> : null}</div>
    </div> : null}
    {canAdminister ? <><button className="stream-settings-button" type="button" aria-label="Open stream settings" aria-expanded={settingsOpen} onClick={() => setSettingsOpen((open) => !open)}>{settingsOpen ? <X size={20} /> : <Menu size={20} />}</button>{settingsOpen ? <aside className="stream-settings-panel" aria-label="Stream settings"><header><div><Settings2 size={17} /><span><strong>Video settings</strong><small>Administrator controls</small></span></div><button type="button" aria-label="Close stream settings" onClick={() => setSettingsOpen(false)}><X size={17} /></button></header><form action={action}>
      <input type="hidden" name="channelPublicId" value={channel.publicId} />
      {actionState.message ? <div className={`auth-message auth-message-${actionState.status}`} role={actionState.status === "error" ? "alert" : "status"}>{actionState.status === "success" ? <CheckCircle2 size={14} /> : <Settings2 size={14} />}<span>{actionState.message}</span></div> : null}
      <div className="stream-setting-toggles">{toggleFields.map(([key, label]) => <label key={key}><input type="checkbox" name={fieldName(key)} checked={Boolean(settings[key])} onChange={(event) => setSettings((current) => ({ ...current, [key]: event.target.checked }))} /><span>{label}</span></label>)}</div>
      <label><span>Stripe banner text</span><input name="stripe-banner-text" maxLength={240} value={settings.stripeBannerText} onChange={(event) => setSettings((current) => ({ ...current, stripeBannerText: event.target.value }))} /></label>
      <label><span>Stripe position</span><select name="stripe-banner-position" value={settings.stripeBannerPosition} onChange={(event) => setSettings((current) => ({ ...current, stripeBannerPosition: event.target.value }))}><option value="top">Top</option><option value="bottom">Bottom</option></select></label>
      <label><span>Video scaling</span><select name="video-fit" value={settings.videoFit} onChange={(event) => setSettings((current) => ({ ...current, videoFit: event.target.value }))}><option value="contain">Fit full video</option><option value="cover">Fill screen and crop</option></select></label>
      <button className="stream-settings-save" type="submit" disabled={pending}>{pending ? <LoaderCircle className="auth-spinner" size={15} /> : <Settings2 size={15} />}{pending ? "Saving…" : "Save stream settings"}</button>
    </form></aside> : null}</> : null}
  </main>;
}
