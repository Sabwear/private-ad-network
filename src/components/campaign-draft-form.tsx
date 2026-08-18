"use client";

import { CalendarDays, Check, CheckCircle2, LoaderCircle, MapPinned, Megaphone, ShieldCheck, Target, WalletCards } from "lucide-react";
import { useActionState, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { publishCampaign, type CampaignActionState } from "@/app/(platform)/campaigns/actions";

export type CampaignAdvertiserOption = { id: number; name: string; category: string };
export type CampaignMediaOption = { id: number; name: string; organizationId: number; organization: string };
export type CampaignLocationOption = { id: number; name: string; organizationId: number; organization: string; zone: string; category: string; trafficBand: string };

export type CampaignFieldDefaults = {
  name: string;
  mediaAssetId: number;
  startsOn: string;
  endsOn: string;
  budgetCredits: number;
  targetIds: number[];
};

const initialState: CampaignActionState = { status: "idle", message: "" };

export function CampaignFields({ advertisers, media, locations, minimumDate, initialOrganizationId, allowAdvertiserSelection, defaults, pending, mode }: {
  advertisers: CampaignAdvertiserOption[];
  media: CampaignMediaOption[];
  locations: CampaignLocationOption[];
  minimumDate: string;
  initialOrganizationId: number | null;
  allowAdvertiserSelection: boolean;
  defaults?: CampaignFieldDefaults;
  pending: boolean;
  mode: "create" | "edit";
}) {
  const selectableAdvertiser = allowAdvertiserSelection && advertisers.length > 1;
  const startingOrganization = initialOrganizationId ?? (advertisers.length === 1 ? advertisers[0].id : 0);
  const [organizationId, setOrganizationId] = useState(startingOrganization);
  const availableMedia = useMemo(() => media.filter((asset) => asset.organizationId === organizationId), [media, organizationId]);
  const availableLocations = useMemo(() => locations.filter((location) => location.organizationId !== organizationId), [locations, organizationId]);
  const [requestedMediaAssetId, setMediaAssetId] = useState(defaults?.mediaAssetId ?? 0);
  const [selectedLocationIds, setSelectedLocationIds] = useState<number[]>(defaults?.targetIds ?? []);
  const advertiser = advertisers.find((option) => option.id === organizationId);
  const mediaAssetId = availableMedia.some((asset) => asset.id === requestedMediaAssetId) ? requestedMediaAssetId : availableMedia.length === 1 ? availableMedia[0].id : 0;
  const validSelectedLocationIds = selectedLocationIds.filter((id) => availableLocations.some((location) => location.id === id));

  const ready = organizationId > 0 && mediaAssetId > 0 && validSelectedLocationIds.length > 0;
  const toggleLocation = (id: number) => setSelectedLocationIds((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);

  return <>
    <section className="campaign-step">
      <header><span><Megaphone size={17} /></span><div><small>Step 1</small><h3>Campaign and media</h3><p>Name the campaign and choose the approved video that will play.</p></div></header>
      <div className="campaign-basics-grid">
        {selectableAdvertiser ? <label><span>Advertiser business</span><select name="organizationId" required value={organizationId || ""} onChange={(event) => { setOrganizationId(Number(event.target.value)); setMediaAssetId(0); setSelectedLocationIds([]); }}><option value="" disabled>Select business</option>{advertisers.map((option) => <option value={option.id} key={option.id}>{option.name}</option>)}</select></label> : <><input type="hidden" name="organizationId" value={organizationId} />{advertiser ? <div className="campaign-owner-chip"><span>Advertiser business</span><strong>{advertiser.name}</strong></div> : null}</>}
        <label className={selectableAdvertiser ? "" : "campaign-name-field"}><span>Campaign name</span><input name="name" required minLength={3} maxLength={120} defaultValue={defaults?.name} placeholder="Autumn lunch promotion" /></label>
      </div>
      <fieldset className="campaign-choice-fieldset"><legend>Approved media</legend>
        {organizationId === 0 ? <p className="campaign-empty-choice">Choose the advertiser business first.</p> : availableMedia.length === 0 ? <p className="campaign-empty-choice">This business has no approved, ready media yet.</p> : <div className="campaign-media-choices">{availableMedia.map((asset) => <label className={mediaAssetId === asset.id ? "selected" : ""} key={asset.id}><input type="radio" name="mediaAssetId" value={asset.id} checked={mediaAssetId === asset.id} onChange={() => setMediaAssetId(asset.id)} /><span className="campaign-choice-check"><Check size={13} /></span><span><strong>{asset.name}</strong><small>{asset.organization}</small></span></label>)}</div>}
      </fieldset>
    </section>

    <section className="campaign-step">
      <header><span><MapPinned size={17} /></span><div><small>Step 2</small><h3>Delivery locations</h3><p>Select the physical locations where this campaign may appear. Targeting is saved with this campaign.</p></div></header>
      <fieldset className="campaign-choice-fieldset"><legend>Locations <b>{validSelectedLocationIds.length} selected</b></legend>
        {availableLocations.length === 0 ? <p className="campaign-empty-choice">Add an active location for another business before publishing.</p> : <><div className="campaign-location-tools"><button type="button" onClick={() => setSelectedLocationIds(availableLocations.map((location) => location.id))}>Select all</button><button type="button" onClick={() => setSelectedLocationIds([])}>Clear</button></div><div className="campaign-location-choices">{availableLocations.map((location) => <label className={validSelectedLocationIds.includes(location.id) ? "selected" : ""} key={location.id}><input type="checkbox" name="targetLocationIds" value={location.id} checked={validSelectedLocationIds.includes(location.id)} onChange={() => toggleLocation(location.id)} /><span className="campaign-choice-check"><Check size={13} /></span><span><strong>{location.name}</strong><small>{location.organization} · {location.zone}</small><em>{location.category} · {location.trafficBand} traffic</em></span></label>)}</div></>}
      </fieldset>
    </section>

    <section className="campaign-step">
      <header><span><CalendarDays size={17} /></span><div><small>Step 3</small><h3>Schedule and budget</h3><p>Set the active period and maximum total campaign spend.</p></div></header>
      <div className="campaign-schedule-grid">
        <label><span>Starts on</span><input name="startsOn" type="date" min={minimumDate} required defaultValue={defaults?.startsOn ?? minimumDate} /></label>
        <label><span>Ends on</span><input name="endsOn" type="date" min={minimumDate} required defaultValue={defaults?.endsOn} /></label>
        <label><span><WalletCards size={14} /> Total budget credits</span><input name="budgetCredits" type="number" min="1" max="1000000000" step="0.01" required defaultValue={defaults?.budgetCredits} placeholder="500" /></label>
      </div>
    </section>

    {!ready ? <div className="campaign-prerequisite"><ShieldCheck size={18} /><div><strong>Complete the required campaign details</strong><p>{organizationId === 0 ? "Choose an advertiser business. " : ""}{organizationId > 0 && availableMedia.length === 0 ? "Upload and approve media for this business. " : mediaAssetId === 0 ? "Choose approved media. " : ""}{availableLocations.length === 0 ? "Add an active host location. " : validSelectedLocationIds.length === 0 ? "Choose at least one delivery location." : ""}</p></div></div> : null}
    <div className="campaign-publish-bar"><div><Target size={18} /><p><strong>Ready to publish</strong><span>{mode === "create" ? "Starts immediately when today is selected; future campaigns are scheduled automatically." : "Saving will publish this draft immediately or schedule it for its start date."}</span></p></div><button className="button button-primary" type="submit" disabled={pending || !ready}>{pending ? <LoaderCircle className="auth-spinner" size={16} /> : <Megaphone size={16} />}{pending ? "Publishing..." : mode === "create" ? "Publish campaign" : "Save and publish"}</button></div>
  </>;
}

export function CampaignDraftForm({ advertisers, media, locations, minimumDate, initialOrganizationId, isPlatformAdmin, locationManager }: { advertisers: CampaignAdvertiserOption[]; media: CampaignMediaOption[]; locations: CampaignLocationOption[]; minimumDate: string; initialOrganizationId: number | null; isPlatformAdmin: boolean; locationManager?: ReactNode }) {
  const [state, action, pending] = useActionState(publishCampaign, initialState);

  return <section className="campaign-create panel" id="create-campaign">
    <div className="panel-header"><div><h2>Create and publish campaign</h2><p>Three focused steps: choose media, select delivery locations, then set the schedule and total budget.</p></div><Target size={20} /></div>
    <form action={action} className="campaign-create-form">
      {state.message ? <div className={`auth-message auth-message-${state.status}`} role={state.status === "error" ? "alert" : "status"}>{state.status === "success" ? <CheckCircle2 size={16} /> : <ShieldCheck size={16} />}<span>{state.message}</span></div> : null}
      <CampaignFields key={state.status} advertisers={advertisers} media={media} locations={locations} minimumDate={minimumDate} initialOrganizationId={initialOrganizationId} allowAdvertiserSelection={isPlatformAdmin} pending={pending} mode="create" />
    </form>
    {locationManager ? <details className="campaign-location-inventory"><summary><MapPinned size={16} /><span><strong>Add or edit delivery locations</strong><small>Location inventory stays here with campaign targeting.</small></span></summary><div>{locationManager}</div></details> : null}
  </section>;
}
