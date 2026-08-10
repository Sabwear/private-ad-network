"use client";

import { Trash2 } from "lucide-react";
import { deleteCampaignDraft } from "@/app/(platform)/campaigns/actions";

export function DeleteCampaignDraft({ publicId, name }: { publicId: string; name: string }) {
  return <form action={deleteCampaignDraft} onSubmit={(event) => { if (!window.confirm(`Delete the draft “${name}”? This cannot be undone.`)) event.preventDefault(); }}><input type="hidden" name="campaignPublicId" value={publicId} /><button className="text-button danger-text" type="submit"><Trash2 size={13} /> Delete draft</button></form>;
}
