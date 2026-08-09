"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bell, Building2, ChevronDown, CircleHelp, Clapperboard, Gauge, LayoutDashboard, LogOut, Mail, MapPinned, Menu, MonitorPlay, Orbit, RadioTower, ReceiptText, Search, Settings, ShieldCheck, UsersRound, WalletCards, X } from "lucide-react";
import { useState } from "react";
import { Brand } from "@/components/brand";
import type { WorkspaceContext } from "@/lib/auth/workspace";

const flowNav = [
  { href: "/locations", label: "Locations", icon: MapPinned },
  { href: "/screens", label: "Screens", icon: MonitorPlay },
  { href: "/media", label: "Media", icon: Clapperboard },
  { href: "/channels", label: "Channels", icon: RadioTower },
  { href: "/campaigns", label: "Campaigns", icon: Gauge },
  { href: "/proof", label: "Proof of play", icon: ShieldCheck },
  { href: "/wallet", label: "Wallet", icon: WalletCards },
] as const;

export function AppShell({ children, workspace, signOutAction }: { children: React.ReactNode; workspace: WorkspaceContext; signOutAction: () => Promise<void> }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const environmentLabel = workspace.mode === "active" ? "Limited beta" : "Setup required";
  return (
    <div className="app-shell">
      <aside className={`sidebar ${open ? "sidebar-open" : ""}`}>
        <div className="sidebar-top"><Brand /><button className="icon-button sidebar-close" onClick={() => setOpen(false)} aria-label="Close navigation"><X size={20} /></button></div>
        <nav className="primary-nav" aria-label="Primary navigation">
          <span className="nav-label">Workspace</span>
          <Link href="/overview" className={pathname === "/overview" ? "nav-link active" : "nav-link"} onClick={() => setOpen(false)}><LayoutDashboard size={19} strokeWidth={1.9} /><span>Overview</span></Link>
          {workspace.permissions.canProvisionOrganizations ? <Link href="/business" className={pathname === "/business" ? "nav-link active" : "nav-link"} onClick={() => setOpen(false)}><Building2 size={19} strokeWidth={1.9} /><span>Business</span></Link> : null}
          {flowNav.map(({ href, label, icon: Icon }) => <Link key={href} href={href} className={pathname === href ? "nav-link active" : "nav-link"} onClick={() => setOpen(false)}><Icon size={19} strokeWidth={1.9} /><span>{label}</span></Link>)}
          <span className="nav-label nav-label-spaced">Operations</span>
          {workspace.permissions.canProvisionOrganizations ? <Link href="/users" className={pathname === "/users" ? "nav-link active" : "nav-link"} onClick={() => setOpen(false)}><UsersRound size={19} strokeWidth={1.9} /><span>Users</span></Link> : null}
          {workspace.permissions.canAccessAdmin ? <Link href="/admin" className={pathname === "/admin" ? "nav-link active" : "nav-link"} onClick={() => setOpen(false)}><Settings size={19} strokeWidth={1.9} /><span>Admin control</span></Link> : null}
          <span className="nav-link nav-link-disabled" aria-disabled="true"><ReceiptText size={19} strokeWidth={1.9} /><span>Reports</span><span className="nav-badge">Later</span></span>
        </nav>
        <div className="pilot-card"><div className="pilot-card-icon"><Orbit size={18} /></div><div><strong>Limited beta</strong><p>Controlled testers only</p></div><div className="pilot-progress"><span /></div></div>
        <div className="account-wrap">
          <button className="sidebar-user" type="button" aria-expanded={accountOpen} onClick={() => setAccountOpen((current) => !current)}><span className="avatar">{workspace.user.initials}</span><span><strong>{workspace.organization.name}</strong><small>{workspace.membership.label}</small></span><ChevronDown size={17} /></button>
          {accountOpen ? <div className="account-menu"><div><Mail size={14} /><span><small>Signed in as</small><strong>{workspace.user.email}</strong></span></div><form action={signOutAction}><button type="submit"><LogOut size={15} /> Sign out</button></form></div> : null}
        </div>
      </aside>
      {open ? <button className="sidebar-scrim" onClick={() => setOpen(false)} aria-label="Close navigation" /> : null}
      <div className="workspace">
        <header className="topbar">
          <button className="icon-button menu-button" onClick={() => setOpen(true)} aria-label="Open navigation"><Menu size={21} /></button>
          <div className="search-box"><Search size={18} /><input aria-label="Search" placeholder="Search businesses, locations, screens..." /></div>
          <div className="topbar-actions"><button className="icon-button" aria-label="Help"><CircleHelp size={19} /></button><button className="icon-button notification-button" aria-label="Notifications"><Bell size={19} /><span /></button><span className={`environment-pill environment-${workspace.mode}`}><span /> {environmentLabel}</span></div>
        </header>
        <main className="main-content">{workspace.notice ? <div className={`workspace-notice notice-${workspace.mode}`}><ShieldCheck size={17} /><span>{workspace.notice}</span></div> : null}{children}</main>
      </div>
    </div>
  );
}
