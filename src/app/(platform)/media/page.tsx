import { Film, Play, Plus, Upload } from "lucide-react";
import { PageHeading } from "@/components/page-heading";
import { StatusPill } from "@/components/status-pill";
import { mediaAssets } from "@/lib/platform-data";

export const metadata = { title: "Media" };

export default function MediaPage() {
  return <><PageHeading eyebrow="Creative library" title="Media" description="Upload compliant video, follow technical validation, and manage moderation." actions={<button className="button button-primary"><Upload size={17} /> Upload video</button>} /><section className="upload-banner"><span className="upload-icon"><Film size={25} /></span><div><h2>Ready for a new creative?</h2><p>MP4 · H.264 / AAC · 1920 × 1080 · 15, 30, or 60 seconds</p></div><button className="button button-secondary"><Plus size={17} /> Select file</button></section><section className="media-grid">{mediaAssets.map((asset) => <article className="media-card" key={asset.name}><div className={`media-preview preview-${asset.color}`}><span className="preview-noise" /><button aria-label={`Preview ${asset.name}`}><Play size={22} fill="currentColor" /></button><small>{asset.duration}</small></div><div className="media-body"><div className="media-title-row"><div><h2>{asset.name}</h2><p>{asset.owner}</p></div><StatusPill tone={asset.tone}>{asset.status}</StatusPill></div><dl><div><dt>Technical format</dt><dd>{asset.format}</dd></div><div><dt>Last updated</dt><dd>{asset.updated}</dd></div></dl><footer><button className="text-button">View details</button><button className="text-button">Replace</button></footer></div></article>)}</section></>;
}
