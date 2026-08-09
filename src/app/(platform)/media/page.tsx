import { Film, Play, Upload } from "lucide-react";
import Link from "next/link";
import { MediaModerationPanel, MediaUploadPanel } from "@/components/media-management";
import { PageHeading } from "@/components/page-heading";
import { StatusPill } from "@/components/status-pill";
import { getWorkspaceContext } from "@/lib/auth/workspace";
import { getMediaLibrary } from "@/lib/repositories/media";

export const metadata = { title: "Media" };

export default async function MediaPage() {
  const [result, workspace] = await Promise.all([getMediaLibrary(), getWorkspaceContext()]);
  const canUpload = workspace.permissions.canUploadMedia && result.source === "supabase";
  const canModerate = workspace.permissions.canModerateMedia && result.source === "supabase";
  const sourceLabel = result.source === "supabase" ? "Live library" : result.source === "setup" ? "Setup required" : "Preview data";

  return <>
    <PageHeading
      eyebrow="Creative library"
      title="Media"
      description={canModerate ? "Review submitted advertising, record decisions, and keep unapproved media out of campaigns." : "Upload compliant video, complete technical preflight, and follow platform moderation."}
      actions={<><span className={`data-source data-source-${result.source}`}>{sourceLabel}</span>{canUpload ? <Link className="button button-primary" href="#media-upload"><Upload size={17} /> Upload video</Link> : null}</>}
    />

    <section className="mini-metric-grid media-metrics">
      <div><span>Total creatives</span><strong>{result.summary.total}</strong><small>Visible to this workspace</small></div>
      <div><span>Waiting for review</span><strong>{result.summary.inReview}</strong><small>Needs a platform decision</small></div>
      <div><span>Approved</span><strong className="success-text">{result.summary.approved}</strong><small>Eligible for campaigns</small></div>
      <div><span>Rejected</span><strong className="danger-text">{result.summary.rejected}</strong><small>Reason recorded</small></div>
    </section>

    {canUpload ? <div id="media-upload" className="media-upload-wrap"><MediaUploadPanel /></div> : null}

    {!canUpload && !canModerate ? <section className="upload-banner"><span className="upload-icon"><Film size={25} /></span><div><h2>{result.source === "setup" ? "Workspace setup required" : "Media library access"}</h2><p>{result.source === "setup" ? "An administrator must complete your business workspace before media can be uploaded." : "Owners and staff can submit media. Approved reviewers manage moderation."}</p></div></section> : null}

    {result.assets.length === 0 ? <section className="empty-state"><Film size={28} /><h2>{canModerate ? "No media waiting yet" : "No media uploaded yet"}</h2><p>{canModerate ? "Submitted business creatives will appear here for review." : canUpload ? "Upload the first MP4 creative above to begin moderation." : "Media will appear after a business submits its first creative."}</p></section> : <section className="media-grid">{result.assets.map((asset, index) => <article className="media-card" key={asset.id}>
      <div className={`media-preview preview-${["teal", "orange", "blue", "purple"][index % 4]}`}>
        {asset.previewUrl ? <video className="media-video" controls controlsList="nodownload" preload="metadata" src={asset.previewUrl} aria-label={`Preview ${asset.name}`} /> : <><span className="preview-noise" /><span className="media-preview-placeholder"><Play size={22} fill="currentColor" /></span></>}
        <small>{asset.duration}</small>
      </div>
      <div className="media-body">
        <div className="media-title-row"><div><h2>{asset.name}</h2><p>{asset.owner}</p></div><StatusPill tone={asset.tone}>{asset.status}</StatusPill></div>
        <dl><div><dt>Technical format</dt><dd>{asset.format}</dd></div><div><dt>Processing</dt><dd>{asset.processingStatus.replaceAll("_", " ")}</dd></div><div><dt>File</dt><dd>{asset.fileName} / {asset.fileSize}</dd></div><div><dt>Last updated</dt><dd>{asset.updated}</dd></div></dl>
        {asset.processingError ? <p className="media-rejection"><strong>Processing issue:</strong> {asset.processingError}</p> : null}
        {asset.rejectionReason ? <p className="media-rejection"><strong>Rejection reason:</strong> {asset.rejectionReason}</p> : null}
        {canModerate ? <MediaModerationPanel asset={asset} /> : null}
      </div>
    </article>)}</section>}
  </>;
}
