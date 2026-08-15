# Architecture Decision Records

## ADR-001 - Modular monolith first

**Status:** Accepted

Use one deployable API with strict domain modules and a separate media worker. This keeps transactions and operations understandable during the pilot without creating an unstructured codebase.

## ADR-002 - Cached playlist, not live stream

**Status:** Accepted

The server controls versioned playlists while devices download and play assets locally. This reduces bandwidth, avoids buffering, supports outages, and produces stronger per-asset evidence.

## ADR-003 - Standard Android TV box

**Status:** Accepted

Pilot on one managed Android TV/Google TV hardware model connected over HDMI. Native Tizen and webOS applications are deferred until network scale justifies their testing and certification cost.

## ADR-004 - PostgreSQL double-entry ledger

**Status:** Accepted

Credits are service units recorded in immutable balanced transactions. Wallet balances are projections. Settlements and reversals are atomic and idempotent.

## ADR-005 - 1:1 membership-first pilot

**Status:** Accepted for pilot

Advertiser debit equals host credit. Revenue comes from pilot membership/services. A spread may be introduced only after value and reporting trust are demonstrated.

## ADR-006 - Evidence decisions are multi-signal

**Status:** Accepted

Use accepted, held, and rejected outcomes. Weak or unavailable consumer-TV signals reduce confidence but do not alone prove fraud.

## ADR-007 - Next.js central portal

**Status:** Accepted

Next.js App Router with TypeScript supports the business portal and admin console in one responsive application. Server Components are the default for reads; device/external clients use versioned API contracts.

## ADR-008 - No audience surveillance in MVP

**Status:** Accepted

No cameras, microphones, facial recognition, or demographic inference. The platform proves broadcasting behavior rather than attention or audience identity.

## ADR-009 - Administrator-managed organizations

**Status:** Accepted

Accounts and business organizations have separate lifecycles. A user may create and verify an account, but only a protected platform administrator can create an organization and assign its first owner. Unassigned accounts cannot enter the business workspace. Organization provisioning, membership assignment, wallet initialization, and account activation execute atomically and are audited at the database boundary.

## ADR-010 - Portable web runtime

**Status:** Accepted

The central application targets the standard Next.js Node.js runtime. Vercel is the current host, but product code cannot depend on a single hosting provider. A standalone container remains a supported deployment path, while CPU-heavy FFmpeg work runs in a separate worker process.

## ADR-011 - Browser stream and offline device playback are separate delivery modes

**Status:** Accepted

The protected browser channel is a continuous pre-recorded stream for previews and beta displays. The production venue player will consume signed, versioned manifests and cache approved assets locally. Browser streaming does not replace the offline-first Android TV playback requirement.

## ADR-012 - Business branding is an independently controlled presentation layer

**Status:** Accepted

Business logos are public presentation assets with administrator-only mutation. Logo placement and size belong to the business profile, while each channel controls whether logos and other information overlays are displayed. The public player may read the resulting logo URL but cannot change branding or channel settings.

## Open decisions

- Final product/brand name
- Launch city and legal jurisdiction
- Reference Android TV box model
- Exact membership and installation pricing
- Credit expiry policy per credit source
- Audio default and loudness range
- Detailed evidence retention duration
- Payment provider and invoice workflow after pilot stability
