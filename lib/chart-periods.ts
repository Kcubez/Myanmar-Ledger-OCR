/** Monday-based calendar weeks; missing reporting days remain missing. */
export function weeklyStock<T extends {date:string; incoming:number; outgoing:number; balance:number|null}>(rows:T[]) {
  const weeks = new Map<string,{date:string;incoming:number;outgoing:number;balance:number|null}>();
  for (const row of [...rows].sort((a,b)=>a.date.localeCompare(b.date))) {
    const d = new Date(`${row.date}T00:00:00Z`); d.setUTCDate(d.getUTCDate()-(d.getUTCDay()+6)%7);
    const key=d.toISOString().slice(0,10), previous=weeks.get(key);
    weeks.set(key,{date:key,incoming:(previous?.incoming??0)+row.incoming,outgoing:(previous?.outgoing??0)+row.outgoing,balance:row.balance});
  }
  return [...weeks.values()];
}
