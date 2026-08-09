"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bell, ChevronDown, CircleHelp, Clapperboard, Gauge, LayoutDashboard, Menu, MonitorPlay, Orbit, ReceiptText, Search, Settings, ShieldCheck, WalletCards, X } from "lucide-react";
import { useState } from "react";
import { Brand } from "@/components/brand";

const nav = [
  { href: "/overview", label: "Overview", icon: LayoutDashboard },
  { href: "/campaigns", label: "Campaigns", icon: Gauge },
  { href: "/screens", label: "Screens", icon: MonitorPlay },
  { href: "/media", label: "Media", icon: Clapperboard },
  { href: "/wallet", label: "Wallet", icon: WalletCards },
  { href: "/proof", label: "Proof of play", icon: ShieldCheck },
] as const;

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  return (
    <div className="app-shell">
      <aside className={`sidebar ${open ? "sidebar-open" : ""}`}>
        <div className="sidebar-top"><Brand /><button className="icon-button sidebar-close" onClick={() => setOpen(false)} aria-label="Close navigation"><X size={20} /></button></div>
        <nav className="primary-nav" aria-label="Primary navigation">
          <span className="nav-label">Workspace</span>
          {nav.map(({ href, label, icon: Icon }) => <Link key={href} href={href} className={pathname === href ? "nav-link active" : "nav-link"} onClick={() => setOpen(false)}><Icon size={19} strokeWidth={1.9} /><span>{label}</span></Link>)}
          <span className="nav-label nav-label-spaced">Operations</span>
          <Link href="/admin" className={pathname === "/admin" ? "nav-link active" : "nav-link"} onClick={() => setOpen(false)}><Settings size={19} strokeWidth={1.9} /><span>Admin control</span></Link>
          <Link href="#" className="nav-link"><ReceiptText size={19} strokeWidth={1.9} /><span>Reports</span><span className="nav-badge">Soon</span></Link>
        </nav>
        <div className="pilot-card"><div className="pilot-card-icon"><Orbit size={18} /></div><div><strong>Pilot network</strong><p>12 of 14 screens healthy</p></div><div className="pilot-progress"><span /></div></div>
        <div className="sidebar-user"><span className="avatar">CA</span><div><strong>Central Cafe</strong><small>Business owner</small></div><ChevronDown size={17} /></div>
      </aside>
      {open ? <button className="sidebar-scrim" onClick={() => setOpen(false)} aria-label="Close navigation" /> : null}
      <div className="workspace">
        <header className="topbar">
          <button className="icon-button menu-button" onClick={() => setOpen(true)} aria-label="Open navigation"><Menu size={21} /></button>
          <div className="search-box"><Search size={18} /><input aria-label="Search" placeholder="Search campaigns, screens, playbacks..." /></div>
          <div className="topbar-actions"><button className="icon-button" aria-label="Help"><CircleHelp size={19} /></button><button className="icon-button notification-button" aria-label="Notifications"><Bell size={19} /><span /></button><span className="environment-pill"><span /> Pilot live</span></div>
        </header>
        <main className="main-content">{children}</main>
      </div>
    </div>
  );
}
