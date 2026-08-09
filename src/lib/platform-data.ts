export type StatusTone = "success" | "warning" | "danger" | "neutral" | "info";

export const metrics = [
  { label: "Spendable credits", value: "1,248.5", detail: "+84.0 earned this week", tone: "teal" },
  { label: "Verified today", value: "392 min", detail: "784 accepted plays", tone: "blue" },
  { label: "Active screens", value: "12 / 14", detail: "2 need attention", tone: "orange" },
  { label: "Campaign delivery", value: "91.4%", detail: "+4.2% vs last week", tone: "violet" },
] as const;

export const campaigns = [
  { name: "Summer menu launch", asset: "30 sec", status: "Active", spent: 621, budget: 900, plays: 1242, pace: "On track", tone: "success" as StatusTone },
  { name: "Late-night delivery", asset: "15 sec", status: "Active", spent: 184, budget: 500, plays: 736, pace: "Under pace", tone: "warning" as StatusTone },
  { name: "New branch opening", asset: "30 sec", status: "Scheduled", spent: 0, budget: 750, plays: 0, pace: "Starts Aug 12", tone: "info" as StatusTone },
  { name: "Weekend family bundle", asset: "60 sec", status: "Paused", spent: 288, budget: 400, plays: 288, pace: "Manual pause", tone: "neutral" as StatusTone },
] as const;

export const screens = [
  { name: "Main shop TV", location: "Central Cafe - Maarif", status: "Online", current: "Summer menu launch", heartbeat: "18 sec ago", uptime: "99.3%", risk: "Low", tone: "success" as StatusTone },
  { name: "Waiting area", location: "Atlas Dental - Gauthier", status: "Online", current: "Late-night delivery", heartbeat: "42 sec ago", uptime: "98.7%", risk: "Low", tone: "success" as StatusTone },
  { name: "Reception display", location: "Nour Fitness - Racine", status: "Syncing", current: "Downloading 2 assets", heartbeat: "51 sec ago", uptime: "96.4%", risk: "Review", tone: "warning" as StatusTone },
  { name: "Branch 2 TV", location: "Central Cafe - Oasis", status: "Offline", current: "Last: House content", heartbeat: "18 min ago", uptime: "92.1%", risk: "Medium", tone: "danger" as StatusTone },
] as const;

export const evidence = [
  { id: "PLY-8F2A1", advertiser: "Central Cafe", host: "Atlas Dental", asset: "Summer menu launch", duration: "30.0 sec", received: "11:42:18", result: "Accepted", credits: "0.50", tone: "success" as StatusTone },
  { id: "PLY-8F29D", advertiser: "Nour Fitness", host: "Central Cafe", asset: "Back-to-school offer", duration: "15.0 sec", received: "11:41:49", result: "Accepted", credits: "0.25", tone: "success" as StatusTone },
  { id: "PLY-8F286", advertiser: "Central Cafe", host: "Nour Fitness", asset: "Late-night delivery", duration: "14.8 sec", received: "11:40:58", result: "Held", credits: "-", tone: "warning" as StatusTone },
  { id: "PLY-8F251", advertiser: "Atlas Dental", host: "Central Cafe", asset: "Smile consultation", duration: "7.2 sec", received: "11:38:22", result: "Rejected", credits: "0.00", tone: "danger" as StatusTone },
] as const;

export const mediaAssets = [
  { name: "Summer menu launch", owner: "Central Cafe", duration: "00:30", format: "1080p / H.264", status: "Approved", updated: "Aug 7, 2026", tone: "success" as StatusTone, color: "coral" },
  { name: "New branch opening", owner: "Central Cafe", duration: "00:30", format: "1080p / H.264", status: "In review", updated: "Aug 8, 2026", tone: "warning" as StatusTone, color: "blue" },
  { name: "Late-night delivery", owner: "Central Cafe", duration: "00:15", format: "1080p / H.264", status: "Approved", updated: "Aug 5, 2026", tone: "success" as StatusTone, color: "purple" },
] as const;

export const ledger = [
  { date: "Aug 9, 11:42", type: "Campaign delivery", reference: "PLY-8F2A1", wallet: "Earned", amount: "+0.50", balance: "1,248.50", positive: true },
  { date: "Aug 9, 11:41", type: "Verified ad play", reference: "PLY-8F29D", wallet: "Earned", amount: "+0.25", balance: "1,248.00", positive: true },
  { date: "Aug 9, 11:36", type: "Campaign delivery", reference: "PLY-8F21C", wallet: "Earned", amount: "-0.50", balance: "1,247.75", positive: false },
  { date: "Aug 9, 10:58", type: "Campaign hold released", reference: "CMP-1029", wallet: "Held", amount: "+12.00", balance: "1,248.25", positive: true },
  { date: "Aug 8, 18:04", type: "Starter allocation", reference: "ADJ-0042", wallet: "Promotional", amount: "+100.00", balance: "1,236.25", positive: true },
] as const;

export const alerts = [
  { title: "Branch 2 TV is offline", detail: "No heartbeat for 18 minutes. Earning paused automatically.", time: "8 min ago", tone: "danger" as StatusTone },
  { title: "1 playback needs review", detail: "Checkpoint timing differs from the expected playback position.", time: "21 min ago", tone: "warning" as StatusTone },
  { title: "Campaign under pace", detail: "Late-night delivery is 16% below its planned delivery curve.", time: "1 hr ago", tone: "info" as StatusTone },
] as const;

export const deliverySeries = [42, 52, 47, 66, 61, 76, 72, 83, 91, 88, 96, 104, 112, 118];
