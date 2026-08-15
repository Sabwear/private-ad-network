"use client";

import Image from "next/image";
import { ImagePlus, LoaderCircle, Trash2 } from "lucide-react";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { saveOrganizationLogo } from "@/app/(platform)/business/actions";
import { createClient } from "@/lib/supabase/client";
import { BUSINESS_LOGO_BUCKET, BUSINESS_LOGO_MAX_BYTES, BUSINESS_LOGO_MIME_TYPES, businessLogoExtension } from "@/lib/storage/business-logo";

export function BusinessLogoUploader({ organizationId, organizationPublicId, logoUrl }: { organizationId: number; organizationPublicId: string; logoUrl: string | null }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function persistLogo(path: string | null) {
    const formData = new FormData();
    formData.set("organizationId", String(organizationId));
    if (path) formData.set("logoStoragePath", path);
    return saveOrganizationLogo(formData);
  }

  async function upload(file: File) {
    if (!BUSINESS_LOGO_MIME_TYPES.has(file.type) || file.size < 1 || file.size > BUSINESS_LOGO_MAX_BYTES) {
      setMessage("Choose a PNG, JPG, or WebP logo up to 2 MB.");
      return;
    }
    setBusy(true);
    setMessage("");
    const supabase = createClient();
    const path = `${organizationPublicId}/${crypto.randomUUID()}.${businessLogoExtension(file.type)}`;
    const { error } = await supabase.storage.from(BUSINESS_LOGO_BUCKET).upload(path, file, { cacheControl: "31536000", contentType: file.type, upsert: false });
    if (error) {
      setBusy(false);
      setMessage("The logo could not be uploaded. Confirm the branding migration is deployed.");
      return;
    }
    const result = await persistLogo(path);
    if (result.status === "error") {
      await supabase.storage.from(BUSINESS_LOGO_BUCKET).remove([path]);
      setBusy(false);
      setMessage(result.message);
      return;
    }
    setBusy(false);
    setMessage("Logo uploaded.");
    if (inputRef.current) inputRef.current.value = "";
    router.refresh();
  }

  async function remove() {
    if (!window.confirm("Remove this business logo from every channel overlay?")) return;
    setBusy(true);
    setMessage("");
    const result = await persistLogo(null);
    setBusy(false);
    setMessage(result.message);
    if (result.status === "success") router.refresh();
  }

  return <div className="business-logo-uploader">
    <div className="business-logo-preview">{logoUrl ? <Image src={logoUrl} alt="Current business logo" width={180} height={90} unoptimized /> : <ImagePlus size={24} />}</div>
    <div><strong>Channel logo</strong><small>PNG, JPG, or WebP. Transparent PNG works best.</small><div className="business-logo-actions"><label className="button button-secondary"><ImagePlus size={14} /> {logoUrl ? "Replace logo" : "Upload logo"}<input ref={inputRef} type="file" accept="image/png,image/jpeg,image/webp" disabled={busy} onChange={(event) => { const file = event.target.files?.[0]; if (file) void upload(file); }} /></label>{logoUrl ? <button className="text-button danger-text" type="button" disabled={busy} onClick={() => void remove()}><Trash2 size={13} /> Remove</button> : null}</div>{message ? <small className="business-logo-message" role="status">{busy ? <LoaderCircle className="auth-spinner" size={12} /> : null}{message}</small> : null}</div>
  </div>;
}
