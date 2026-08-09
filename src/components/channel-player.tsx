"use client";

import Hls from "hls.js";
import { RadioTower, Volume2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { PublicChannelStream } from "@/lib/streaming/public-channel";

export function ChannelPlayer({ channel }: { channel: PublicChannelStream }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [index, setIndex] = useState(0);
  const [muted, setMuted] = useState(true);
  const [unavailable, setUnavailable] = useState(false);
  const item = channel.items[index];

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !item) return;
    let hls: Hls | null = null;
    let usingFallback = !item.hlsUrl;
    setUnavailable(false);

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

  if (!item) return <main className="stream-page"><div className="stream-empty"><RadioTower size={38} /><p className="eyebrow">{channel.name}</p><h1>Channel is ready</h1><span>Add approved media from the Channels dashboard to begin streaming.</span></div></main>;

  return <main className="stream-page">
    <video ref={videoRef} autoPlay muted={muted} playsInline onEnded={() => setIndex((current) => (current + 1) % channel.items.length)} />
    {unavailable ? <div className="stream-playback-error" role="alert">This media is temporarily unavailable. The player will recover when the source is restored.</div> : null}
    <div className="stream-overlay"><div><span className="stream-live"><i /> Live channel</span><h1>{channel.name}</h1><p>Now playing: {item.name}</p></div><button type="button" onClick={() => setMuted((current) => !current)}><Volume2 size={18} />{muted ? "Enable sound" : "Mute"}</button></div>
  </main>;
}
