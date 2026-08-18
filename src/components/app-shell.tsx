"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Activity, Bell, Building2, ChevronDown, CircleHelp, Clapperboard, Gauge, LayoutDashboard, LogOut, Mail, Menu, Orbit, RadioTower, ReceiptText, Search, Settings, ShieldCheck, UsersRound, WalletCards, X } from "lucide-react";
import { useMemo, useState } from "react";
import { Brand } from "@/components/brand";
import type { WorkspaceContext } from "@/lib/auth/workspace";
import type { HeaderData } from "@/lib/repositories/header";

const flowNav = [
  { href: "/media", label: "Media", description: "Upload and approve advertising media", icon: Clapperboard },
  { href: "/campaigns", label: "Campaigns", description: "Campaigns, locations, and targeting", icon: Gauge },
  { href: "/proof", label: "Proof of play", description: "Review verified playback evidence", icon: ShieldCheck },
  { href: "/wallet", label: "Wallet", description: "Review credits and transactions", icon: WalletCards },
] as const;

type HeaderPanel = "guide" | "notifications" | null;

export function AppShell({ children, workspace, header, signOutAction }: { children: React.ReactNode; workspace: WorkspaceContext; header: HeaderData; signOutAction: () => Promise<void> }) {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [panel, setPanel] = useState<HeaderPanel>(null);
  const [search, setSearch] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);

  const searchItems = useMemo(() => {
    const items = [
      { href: "/overview", label: "Overview", description: "Network performance and status", icon: LayoutDashboard },
      { href: "/business", label: "Business", description: "Business profiles, logos, and channel ads", icon: Building2 },
      ...flowNav,
      { href: "/users", label: "Users", description: "Administrators, viewers, and sessions", icon: UsersRound },
      { href: "/operations", label: "Operations", description: "Channels, stream links, viewers, health, and incidents", icon: Activity },
      { href: "/admin", label: "Admin control", description: "Platform operations and audit controls", icon: Settings },
    ];
    const term = search.trim().toLowerCase();
    return term ? items.filter((item) => `${item.label} ${item.description}`.toLowerCase().includes(term)).slice(0, 7) : items.slice(0, 7);
  }, [search]);

  function togglePanel(next: Exclude<HeaderPanel, null>) {
    setSearchOpen(false);
    setPanel((current) => current === next ? null : next);
  }

  function openFirstSearchResult() {
    const first = searchItems[0];
    if (!first) return;
    setSearchOpen(false);
    setSearch("");
    router.push(first.href);
  }

  function submitSearch(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    openFirstSearchResult();
  }

  const liveHref = header.liveStream?.href ?? "/operations#channels";

  return (
    <div className="app-shell" onKeyDown={(event) => { if (event.key === "Escape") { setPanel(null); setSearchOpen(false); } }}>
      <aside className={`sidebar ${open ? "sidebar-open" : ""}`}>
        <div className="sidebar-top"><Brand /><button className="icon-button sidebar-close" onClick={() => setOpen(false)} aria-label="Close navigation"><X size={20} /></button></div>
        <nav className="primary-nav" aria-label="Primary navigation">
          <span className="nav-label">Workspace</span>
          <Link href="/overview" className={pathname === "/overview" ? "nav-link active" : "nav-link"} onClick={() => setOpen(false)}><LayoutDashboard size={19} strokeWidth={1.9} /><span>Overview</span></Link>
          <Link href="/business" className={pathname === "/business" ? "nav-link active" : "nav-link"} onClick={() => setOpen(false)}><Building2 size={19} strokeWidth={1.9} /><span>Business</span></Link>
          {flowNav.map(({ href, label, icon: Icon }) => <Link key={href} href={href} className={pathname === href ? "nav-link active" : "nav-link"} onClick={() => setOpen(false)}><Icon size={19} strokeWidth={1.9} /><span>{label}</span></Link>)}
          <span className="nav-label nav-label-spaced">Operations</span>
          <Link href="/operations" className={pathname === "/operations" ? "nav-link active" : "nav-link"} onClick={() => setOpen(false)}><Activity size={19} strokeWidth={1.9} /><span>Operations</span></Link>
          <Link href="/users" className={pathname === "/users" ? "nav-link active" : "nav-link"} onClick={() => setOpen(false)}><UsersRound size={19} strokeWidth={1.9} /><span>Users</span></Link>
          <Link href="/admin" className={pathname === "/admin" ? "nav-link active" : "nav-link"} onClick={() => setOpen(false)}><Settings size={19} strokeWidth={1.9} /><span>Admin control</span></Link>
          <span className="nav-link nav-link-disabled" aria-disabled="true"><ReceiptText size={19} strokeWidth={1.9} /><span>Reports</span><span className="nav-badge">Later</span></span>
        </nav>
        <div className="pilot-card"><div className="pilot-card-icon"><Orbit size={18} /></div><div><strong>Limited beta</strong><p>Controlled testers only</p></div><div className="pilot-progress"><span /></div></div>
        <div className="account-wrap">
          <button className="sidebar-user" type="button" aria-expanded={accountOpen} onClick={() => setAccountOpen((current) => !current)}><span className="avatar">{workspace.user.initials}</span><span><strong>{workspace.organization.name}</strong><small>{workspace.account.label}</small></span><ChevronDown size={17} /></button>
          {accountOpen ? <div className="account-menu"><div><Mail size={14} /><span><small>Signed in as</small><strong>{workspace.user.email}</strong></span></div><form action={signOutAction}><button type="submit"><LogOut size={15} /> Sign out</button></form></div> : null}
        </div>
      </aside>
      {open ? <button className="sidebar-scrim" onClick={() => setOpen(false)} aria-label="Close navigation" /> : null}
      <div className="workspace">
        <header className="topbar">
          <button className="icon-button menu-button" onClick={() => setOpen(true)} aria-label="Open navigation"><Menu size={21} /></button>
          <div className="header-search-wrap">
            <form className="search-box" role="search" onSubmit={submitSearch}>
              <Search size={18} />
              <input aria-label="Search platform" placeholder="Search businesses, locations, screens..." value={search} onChange={(event) => { setSearch(event.target.value); setSearchOpen(true); setPanel(null); }} onFocus={() => { setSearchOpen(true); setPanel(null); }} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); openFirstSearchResult(); } }} />
            </form>
            {searchOpen ? <div className="header-popover search-results" aria-label="Search results">
              <div className="header-popover-title"><strong>{search.trim() ? "Search results" : "Quick navigation"}</strong><small>Press Enter to open the first result</small></div>
              {searchItems.length ? searchItems.map(({ href, label, description, icon: Icon }) => <Link key={href} href={href} onClick={() => { setSearchOpen(false); setSearch(""); }}><Icon size={16} /><span><strong>{label}</strong><small>{description}</small></span></Link>) : <p className="header-empty">No matching platform section.</p>}
            </div> : null}
          </div>
          <div className="topbar-actions">
            <div className="header-action-wrap">
              <button className="header-guide-button" type="button" aria-label="Open platform guide" aria-expanded={panel === "guide"} onClick={() => togglePanel("guide")}><CircleHelp size={18} /><span>Guide</span></button>
              {panel === "guide" ? <div className="header-popover action-popover" aria-label="Platform guide">
                <div className="header-popover-title"><strong>Platform guide</strong><small>Recommended operating flow</small></div>
                <Link href="/business" onClick={() => setPanel(null)}><span className="header-step">1</span><span><strong>Create the business</strong><small>Add its profile, schedule, credit rules, and logo.</small></span></Link>
                <Link href="/business#screens" onClick={() => setPanel(null)}><span className="header-step">2</span><span><strong>Pair the screens</strong><small>Connect devices inside the business network.</small></span></Link>
                <Link href="/media" onClick={() => setPanel(null)}><span className="header-step">3</span><span><strong>Approve the media</strong><small>Prepare ads for channel playback.</small></span></Link>
                <Link href="/operations#channels" onClick={() => setPanel(null)}><span className="header-step">4</span><span><strong>Publish the channel</strong><small>Assign ads and configure the stream.</small></span></Link>
              </div> : null}
            </div>
            <div className="header-action-wrap">
              <button className="icon-button notification-button" type="button" aria-label="Open notifications" aria-expanded={panel === "notifications"} onClick={() => togglePanel("notifications")}><Bell size={19} /><span aria-hidden="true" /></button>
              {panel === "notifications" ? <div className="header-popover action-popover notification-popover" aria-label="Notifications">
                <div className="header-popover-title"><strong>Notifications</strong><small>2 operational updates</small></div>
                <Link href={liveHref} onClick={() => setPanel(null)}><RadioTower size={16} /><span><strong>{header.liveStream ? "Live Beta is broadcasting" : "Live channel needs attention"}</strong><small>{header.liveStream?.name ?? "Open Channels to configure a stream."}</small></span></Link>
                <Link href="/proof" onClick={() => setPanel(null)}><ShieldCheck size={16} /><span><strong>Playback verification available</strong><small>Review recent proof-of-play activity.</small></span></Link>
              </div> : null}
            </div>
            <Link className="environment-pill environment-active live-beta-link" href={liveHref} aria-label={header.liveStream ? `Open ${header.liveStream.name} live stream` : "Configure live beta stream"}><span aria-hidden="true" /><RadioTower size={14} /><b>Live Beta</b></Link>
          </div>
        </header>
        <main className="main-content">{workspace.notice ? <div className={`workspace-notice notice-${workspace.mode}`}><ShieldCheck size={17} /><span>{workspace.notice}</span></div> : null}{children}</main>
      </div>
    </div>
  );
}
