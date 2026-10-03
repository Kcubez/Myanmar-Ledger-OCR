export type StockRow = { date: string; category: string; particular: string; unit: string; position: number; incoming: number | null; outgoing: number | null; balance: number | null };
export function stockSeries(rows: StockRow[]) {
  const groups = new Map<string, { id: string; label: string; unit: string; days: { date: string; incoming: number; outgoing: number; balance: number | null }[] }>();
  for (const row of [...rows].sort((a,b) => a.date.localeCompare(b.date) || a.position-b.position)) {
    const id = JSON.stringify([row.category, row.category === 'fuel' ? '' : row.particular.trim(), row.unit]);
    let group = groups.get(id);
    if (!group) { group = { id, label: row.category === 'fuel' ? 'Fuel · Shared tank' : `${row.category[0].toUpperCase()}${row.category.slice(1)} · ${row.particular}`, unit: row.unit, days: [] }; groups.set(id, group); }
    let day = group.days.at(-1);
    if (!day || day.date !== row.date) { day = { date: row.date, incoming: 0, outgoing: 0, balance: null }; group.days.push(day); }
    day.incoming += row.incoming ?? 0;
    day.outgoing += row.outgoing ?? 0;
    // Last physical balance, including unreadable/null. Never sum running balances.
    day.balance = row.balance;
  }
  return [...groups.values()];
}
