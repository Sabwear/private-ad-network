const youtubeIdPattern = /^[A-Za-z0-9_-]{11}$/;

export function parseYouTubeVideoId(input: string) {
  try {
    const url = new URL(input.trim());
    if (url.protocol !== "https:") return null;

    const hostname = url.hostname.toLowerCase().replace(/^www\./, "");
    let candidate: string | null = null;
    if (hostname === "youtu.be") candidate = url.pathname.split("/").filter(Boolean)[0] ?? null;
    if (["youtube.com", "m.youtube.com", "music.youtube.com"].includes(hostname)) {
      candidate = url.pathname === "/watch"
        ? url.searchParams.get("v")
        : url.pathname.match(/^\/(?:embed|shorts)\/([^/?]+)/)?.[1] ?? null;
    }
    if (hostname === "youtube-nocookie.com") candidate = url.pathname.match(/^\/embed\/([^/?]+)/)?.[1] ?? null;
    return candidate && youtubeIdPattern.test(candidate) ? candidate : null;
  } catch {
    return null;
  }
}

export function youtubeEmbedUrl(videoId: string, options?: { autoplay?: boolean; controls?: boolean }) {
  const params = new URLSearchParams({
    playsinline: "1",
    rel: "0",
    modestbranding: "1",
  });
  if (options?.autoplay) {
    params.set("autoplay", "1");
    params.set("mute", "1");
    params.set("enablejsapi", "1");
  }
  params.set("controls", options?.controls === false ? "0" : "1");
  return `https://www.youtube-nocookie.com/embed/${videoId}?${params.toString()}`;
}
