"use client";

import { CheckCircle2, Pencil, ShieldCheck } from "lucide-react";
import { useActionState, useEffect, useRef } from "react";
import { updateCampaignDraft, type CampaignActionState } from "@/app/(platform)/campaigns/actions";
import { CampaignFields, type CampaignAdvertiserOption, type CampaignFieldDefaults, type CampaignMediaOption, type CampaignTargetOption } from "@/components/campaign-draft-form";

const initialState: CampaignActionState = { status: "idle", message: "" };

export function CampaignDraftEditor({
  publicId,
  organizationId,
  defaults,
  advertisers,
  media,
  targets,
  minimumDate,
}: {
  publicId: string;
  organizationId: number;
  defaults: CampaignFieldDefaults;
  advertisers: CampaignAdvertiserOption[];
  media: CampaignMediaOption[];
  targets: CampaignTargetOption[];
  minimumDate: string;
}) {
  const [state, action, pending] = useActionState(updateCampaignDraft, initialState);
  const detailsRef = useRef<HTMLDetailsElement>(null);
  useEffect(() => { if (state.status === "success" && detailsRef.current) detailsRef.current.open = false; }, [state.status]);

  return <details className="management-editor campaign-editor" ref={detailsRef}>
    <summary><Pencil size={13} /> Edit</summary>
    <form action={action} className="management-inline-form campaign-edit-form">
      <header><strong>Edit campaign draft</strong><small>The advertiser business cannot be changed after creation.</small></header>
      <input type="hidden" name="campaignPublicId" value={publicId} />
      {state.message ? <div className={`auth-message auth-message-${state.status}`} role={state.status === "error" ? "alert" : "status"}>{state.status === "success" ? <CheckCircle2 size={16} /> : <ShieldCheck size={16} />}<span>{state.message}</span></div> : null}
      <CampaignFields advertisers={advertisers} media={media} targets={targets} minimumDate={minimumDate} initialOrganizationId={organizationId} allowAdvertiserSelection={false} defaults={defaults} pending={pending} mode="edit" />
    </form>
  </details>;
}
