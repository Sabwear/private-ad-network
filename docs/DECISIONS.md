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

## Open decisions

- Final product/brand name
- Launch city and legal jurisdiction
- Reference Android TV box model
- Exact membership and installation pricing
- Credit expiry policy per credit source
- Audio default and loudness range
- Detailed evidence retention duration
- Payment provider and invoice workflow after pilot stability
