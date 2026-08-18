import { Film, Play, Upload } from "lucide-react";
import Link from "next/link";
import { MediaDeleteControl, MediaModerationPanel, MediaPreviewControls, MediaUploadPanel } from "@/components/media-management";
import { PageHeading } from "@/components/page-heading";
import { StatusPill } from "@/components/status-pill";
import { getWorkspaceContext } from "@/lib/auth/workspace";
import { getMediaLibrary } from "@/lib/repositories/media";
import { youtubeEmbedUrl } from "@/lib/media/youtube";

export const metadata = { title: "Media" };

export default async function MediaPage() {
  const [result, workspace] = await Promise.all([getMediaLibrary(), getWorkspaceContext()]);
  const canUpload = workspace.permissions.canAccessAdmin && result.source === "supabase";
  const canModerate = workspace.permissions.canModerateMedia && result.source === "supabase";
  const sourceLabel = result.source === "supabase" ? "Live library" : result.source === "setup" ? "Setup required" : "Preview data";

  return <>
    <PageHeading
      eyebrow="Creative library"
      title="Media"
      description="Administrators upload advertising media for any business and control what is available to campaigns and channels."
      actions={<><span className={`data-source data-source-${result.source}`}>{sourceLabel}</span>{canUpload ? <Link className="button button-primary" href="#media-upload"><Upload size={17} /> Add media</Link> : null}</>}
    />

    <section className="mini-metric-grid media-metrics">
      <div><span>Total creatives</span><strong>{result.summary.total}</strong><small>Across every managed business</small></div>
      <div><span>Processing / pending</span><strong>{result.summary.inReview}</strong><small>Becomes available automatically</small></div>
      <div><span>Approved</span><strong className="success-text">{result.summary.approved}</strong><small>Eligible for campaigns</small></div>
      <div><span>Rejected</span><strong className="danger-text">{result.summary.rejected}</strong><small>Reason recorded</small></div>
    </section>

    {canUpload ? <div id="media-upload" className="media-upload-wrap"><MediaUploadPanel organizations={result.organizations} autoApproves={workspace.permissions.canAccessAdmin} /></div> : null}

    {!canUpload && !canModerate ? <section className="upload-banner"><span className="upload-icon"><Film size={25} /></span><div><h2>Media setup required</h2><p>The administrator media service is not available until database setup is complete.</p></div></section> : null}

    {result.assets.length === 0 ? <section className="empty-state"><Film size={28} /><h2>No media uploaded yet</h2><p>Add the first MP4 or YouTube creative above.</p></section> : <section className="media-grid">{result.assets.map((asset, index) => <article className="media-card" key={asset.id}>
      <div className={`media-preview preview-${["teal", "orange", "blue", "purple"][index % 4]}`}>
        {asset.youtubeVideoId ? <MediaPreviewControls source={youtubeEmbedUrl(asset.youtubeVideoId)} title={asset.name} youtube /> : asset.previewUrl ? <MediaPreviewControls source={asset.previewUrl} title={asset.name} /> : <><span className="preview-noise" /><span className="media-preview-placeholder"><Play size={22} fill="currentColor" /></span></>}
        <small>{asset.duration}</small>
      </div>
      <div className="media-body">
        <div className="media-title-row"><div><h2>{asset.name}</h2><p>{asset.owner}</p></div><StatusPill tone={asset.tone}>{asset.status}</StatusPill></div>
        <dl><div><dt>Source</dt><dd>{asset.sourceType === "youtube" ? "YouTube" : "Private upload"}</dd></div><div><dt>Technical format</dt><dd>{asset.format}</dd></div><div><dt>Processing</dt><dd>{asset.processingStatus.replaceAll("_", " ")}</dd></div><div><dt>{asset.sourceType === "youtube" ? "External media" : "File"}</dt><dd>{asset.sourceType === "youtube" ? "Hosted by YouTube" : `${asset.fileName} / ${asset.fileSize}`}</dd></div><div><dt>Last updated</dt><dd>{asset.updated}</dd></div></dl>
        {asset.processingError ? <p className="media-rejection"><strong>Processing issue:</strong> {asset.processingError}</p> : null}
        {asset.rejectionReason ? <p className="media-rejection"><strong>Rejection reason:</strong> {asset.rejectionReason}</p> : null}
        {canModerate ? <MediaModerationPanel asset={asset} /> : null}
        {workspace.permissions.canAccessAdmin ? <MediaDeleteControl assetPublicId={asset.id} name={asset.name} /> : null}
      </div>
    </article>)}</section>}
  </>;
}
