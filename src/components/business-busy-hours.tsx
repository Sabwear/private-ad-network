"use client";

import { Clock3, LoaderCircle, Plus, Trash2, TrendingUp } from "lucide-react";
import { useActionState, useMemo, useState } from "react";
import { updateBusinessBusyPeriods, type BusyHoursActionState } from "@/app/(platform)/business/actions";

type BusyPeriod = { id?: number; day: string; start: string; end: string; multiplier: number };

const initialState: BusyHoursActionState = { status: "idle", message: "" };
const days = [["mon", "Mon"], ["tue", "Tue"], ["wed", "Wed"], ["thu", "Thu"], ["fri", "Fri"], ["sat", "Sat"], ["sun", "Sun"]] as const;
const multipliers = [1.25, 1.5, 2, 2.5, 3, 4, 5];

function hourlyMultiplier(periods: BusyPeriod[], day: string, hour: number) {
  const time = `${String(hour).padStart(2, "0")}:00`;
  return periods.filter((period) => period.day === day && period.start <= time && period.end > time).reduce((peak, period) => Math.max(peak, period.multiplier), 1);
}

export function BusinessBusyHours({ organizationId, periods: initialPeriods, timeZone }: { organizationId: number; periods: BusyPeriod[]; timeZone: string }) {
  const [state, action, pending] = useActionState(updateBusinessBusyPeriods, initialState);
  const [periods, setPeriods] = useState<BusyPeriod[]>(initialPeriods);
  const payload = useMemo(() => JSON.stringify(periods.map(({ day, start, end, multiplier }) => ({ day, start, end, multiplier }))), [periods]);

  function updatePeriod(index: number, patch: Partial<BusyPeriod>) {
    setPeriods((current) => current.map((period, periodIndex) => periodIndex === index ? { ...period, ...patch } : period));
  }

  return <section className="business-busy-hours">
    <header><div><TrendingUp size={18} /><span><strong>Busy hours</strong><small>Increase advertiser credit use when this host venue has its heaviest audience.</small></span></div><span>{timeZone}</span></header>
    <div className="busy-hours-chart" aria-label="Weekly busy-hours multiplier preview">
      <div className="busy-hours-axis"><span>12a</span><span>6a</span><span>12p</span><span>6p</span><span>11p</span></div>
      {days.map(([day, label]) => <div className="busy-hours-day" key={day}><strong>{label}</strong><div>{Array.from({ length: 24 }, (_, hour) => {
        const multiplier = hourlyMultiplier(periods, day, hour);
        return <i key={hour} className={multiplier > 1 ? "busy" : ""} style={{ height: `${8 + Math.min(32, (multiplier - 1) * 10)}px` }} title={`${label} ${String(hour).padStart(2, "0")}:00 · ${multiplier.toFixed(2)}×`} />;
      })}</div></div>)}
    </div>
    <form action={action} className="busy-period-form">
      <input type="hidden" name="organizationId" value={organizationId} />
      <input type="hidden" name="periods" value={payload} />
      <div className="busy-period-list">{periods.map((period, index) => <div className="busy-period-row" key={`${period.id ?? "new"}-${index}`}>
        <select aria-label="Busy day" value={period.day} onChange={(event) => updatePeriod(index, { day: event.target.value })}>{days.map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select>
        <label><span>From</span><input type="time" value={period.start} onChange={(event) => updatePeriod(index, { start: event.target.value })} /></label>
        <label><span>To</span><input type="time" value={period.end} onChange={(event) => updatePeriod(index, { end: event.target.value })} /></label>
        <label><span>Consumption</span><select value={period.multiplier} onChange={(event) => updatePeriod(index, { multiplier: Number(event.target.value) })}>{multipliers.map((value) => <option value={value} key={value}>{value}× credits</option>)}</select></label>
        <button type="button" aria-label="Remove busy period" onClick={() => setPeriods((current) => current.filter((_, periodIndex) => periodIndex !== index))}><Trash2 size={14} /></button>
      </div>)}</div>
      <button className="button button-secondary busy-add" type="button" disabled={periods.length >= 50} onClick={() => setPeriods((current) => [...current, { day: "mon", start: "12:00", end: "14:00", multiplier: 1.5 }])}><Plus size={15} /> Add busy period</button>
      <label className="busy-reason"><span>Change reason</span><textarea name="reason" rows={2} minLength={5} maxLength={300} required placeholder="Adjusted after reviewing venue foot-traffic patterns." /></label>
      {state.message ? <small className={`form-status-${state.status}`}>{state.message}</small> : null}
      <button className="button button-primary" type="submit" disabled={pending}>{pending ? <LoaderCircle className="auth-spinner" size={15} /> : <Clock3 size={15} />}{pending ? "Saving…" : "Save busy hours"}</button>
    </form>
    <p className="busy-hours-note">The multiplier applies only while the host business is open and changes advertiser consumption only. Host earning stays at its configured rate, and an exhausted advertiser is removed from fresh playlists without pausing the channel.</p>
  </section>;
}
