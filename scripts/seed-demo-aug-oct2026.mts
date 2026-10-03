/**
 * Demo seed: daily CONFIRMED data 2026-08-02 → 2026-10-02 (62 days).
 * Scope: DailyReport + revenue/expense/maintenance/inventory ONLY.
 * Never touches: fuelEntry/brickEntry (legacy), PendingUpload, SourceImage,
 * TelegramMessage, TelegramSender, BotSettings, User.
 *
 * Deterministic (mulberry32 seeded by yyyymmdd) — re-runs render identically.
 * Running balances are consistent per product + shared fuel tank.
 *
 * Usage: npx tsx --env-file=.env.local scripts/seed-demo-aug-oct2026.mts
 */
import { prisma } from "../lib/prisma";

const START = new Date(Date.UTC(2026, 7, 2)); // Aug 2
const END = new Date(Date.UTC(2026, 9, 2)); // Oct 2

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const round3 = (n: number) => Math.round(n * 1000) / 1000;
const roundKs = (n: number) => Math.round(n / 1000) * 1000;

type MaterialVariant = { category: string; particular: string; unit: string; open: number; maxIn: number; maxOut: number };
const MATERIALS: MaterialVariant[] = [
  { category: "sand", particular: "Sand Shwe", unit: "sud", open: 120, maxIn: 18, maxOut: 14 },
  { category: "gravel", particular: "Gravel 3/4", unit: "sud", open: 90, maxIn: 14, maxOut: 12 },
  { category: "cement", particular: "Cement Alpha", unit: "bags", open: 400, maxIn: 120, maxOut: 100 },
  { category: "cement", particular: "Cement D.R", unit: "bags", open: 250, maxIn: 80, maxOut: 70 },
  { category: "brick", particular: "Brick T.W", unit: "Nos", open: 20000, maxIn: 5000, maxOut: 4000 },
];
const FUEL_PARTICULARS = ["Supplier Aung", "6E-4110", "Ship Shwe Mann", "Excavator CAT"];
const WAGE_NAMES = ["6E-4110 Driver", "U Myo Helper", "Daw Hla Crusher", "Ko Tun Loader"];
const VEHICLES = ["6E-4110", "7M-2234", "Ship Shwe Mann", "Excavator CAT"];
const PARTS = ["Engine oil", "Brake pad", "Tire", "Fuel filter"];

const balances = new Map<string, number>([
  ...MATERIALS.map((m): [string, number] => [`${m.category}|${m.particular}`, m.open]),
  ["fuel|tank", 100],
]);

function dates(): Date[] {
  const out: Date[] = [];
  for (let t = START.getTime(); t <= END.getTime(); t += 86400000) out.push(new Date(t));
  return out;
}

async function seedDay(date: Date) {
  const ymd = date.toISOString().slice(0, 10);
  const seedNum = Number(ymd.replaceAll("-", ""));
  const rnd = mulberry32(seedNum);
  const dow = date.getUTCDay(); // 0 Sun
  const weekend = dow === 0 ? 0.72 : dow === 6 ? 0.85 : 1;
  const wave = 1 + 0.18 * Math.sin((seedNum % 37) / 37 * Math.PI * 2);

  // ── Revenue: total then split across methods (@@unique reportId+method) ──
  const revTotal = roundKs((1_100_000 + rnd() * 1_300_000) * weekend * wave);
  const revLines = [
    { method: "CASH" as const, amount: BigInt(roundKs(revTotal * (0.35 + rnd() * 0.15))) },
    { method: "KBZ_PAY" as const, amount: BigInt(roundKs(revTotal * (0.25 + rnd() * 0.12))) },
    { method: "MMQR" as const, amount: BigInt(0) },
  ];
  const partial = Number(revLines[0].amount) + Number(revLines[1].amount);
  revLines[2].amount = BigInt(Math.max(0, revTotal - partial));
  if (rnd() < 0.3) {
    const specialAmt = roundKs(revTotal * 0.08);
    revLines.push({ method: (rnd() < 0.5 ? "KBZ_SPECIAL" : "AYA_SPECIAL") as "KBZ_SPECIAL" | "AYA_SPECIAL", amount: BigInt(specialAmt) });
  }

  // ── Expense ──
  const expRows: { category: "BUSINESS_DRAWING" | "PERSONAL_DRAWING" | "OPERATION" | "WAGES"; name: string | null; amount: bigint }[] = [
    { category: "OPERATION", name: null, amount: BigInt(roundKs(150_000 + rnd() * 300_000)) },
  ];
  const wageCount = 1 + Math.floor(rnd() * 3);
  for (let i = 0; i < wageCount; i++) {
    expRows.push({ category: "WAGES", name: WAGE_NAMES[Math.floor(rnd() * WAGE_NAMES.length)], amount: BigInt(roundKs(80_000 + rnd() * 100_000)) });
  }
  if (rnd() < 0.2) expRows.push({ category: "BUSINESS_DRAWING", name: null, amount: BigInt(roundKs(100_000 + rnd() * 400_000)) });
  if (rnd() < 0.1) expRows.push({ category: "PERSONAL_DRAWING", name: null, amount: BigInt(roundKs(50_000 + rnd() * 150_000)) });

  // ── Maintenance (~30% of days) ──
  const maintRows: { vehicle: string; amount: bigint; part: string | null }[] = [];
  if (rnd() < 0.35) {
    const n = 1 + (rnd() < 0.35 ? 1 : 0);
    for (let i = 0; i < n; i++) {
      maintRows.push({
        vehicle: VEHICLES[Math.floor(rnd() * VEHICLES.length)],
        amount: BigInt(roundKs(50_000 + rnd() * 750_000)),
        part: PARTS[Math.floor(rnd() * PARTS.length)],
      });
    }
  }

  // ── Inventory materials (one row per variant, running balance) ──
  const matRows = MATERIALS.map((m, position) => {
    const incoming = rnd() < 0.25 ? 0 : round3(rnd() * m.maxIn);
    const outgoing = round3(rnd() * m.maxOut * weekend);
    const key = `${m.category}|${m.particular}`;
    const balance = round3((balances.get(key) ?? 0) + incoming - outgoing);
    balances.set(key, balance);
    return { sheetKind: "materials", position, category: m.category, particular: m.particular, remark: null as string | null, unit: m.unit, quantityIn: incoming, quantityOut: outgoing, balance, balanceOk: true };
  });

  // ── Inventory fuel (2 rows/day, shared-tank running balance, physical order) ──
  const fuelRows = [0, 1].map((position) => {
    const particular = FUEL_PARTICULARS[Math.floor(rnd() * FUEL_PARTICULARS.length)];
    const incoming = position === 0 && rnd() < 0.6 ? round3(20 + rnd() * 90) : 0;
    const outgoing = incoming > 0 ? round3(rnd() * 40) : round3(15 + rnd() * 55);
    const balance = round3((balances.get("fuel|tank") ?? 0) + incoming - outgoing);
    balances.set("fuel|tank", balance);
    return { sheetKind: "fuel", position, category: "fuel", particular, remark: null as string | null, unit: "gal", quantityIn: incoming, quantityOut: outgoing, balance, balanceOk: true };
  });

  const report = await prisma.dailyReport.upsert({
    where: { date },
    create: { date, status: "CONFIRMED" },
    update: { status: "CONFIRMED" },
  });
  const reportId = report.id;

  await prisma.$transaction([
    prisma.revenueLine.deleteMany({ where: { reportId } }),
    prisma.expenseLine.deleteMany({ where: { reportId } }),
    prisma.maintenanceLine.deleteMany({ where: { reportId } }),
    prisma.inventoryEntry.deleteMany({ where: { reportId } }),
  ]);
  const writes = [
    prisma.revenueLine.createMany({ data: revLines.map((l) => ({ reportId, ...l })) }),
    prisma.expenseLine.createMany({ data: expRows.map((r) => ({ reportId, ...r })) }),
    prisma.inventoryEntry.createMany({ data: [...matRows, ...fuelRows].map((r) => ({ reportId, ...r })) }),
  ];
  if (maintRows.length) {
    writes.push(prisma.maintenanceLine.createMany({ data: maintRows.map((r) => ({ reportId, ...r })) }));
  }
  await prisma.$transaction(writes);

  const revSum = revLines.reduce((s, l) => s + Number(l.amount), 0);
  const expSum = expRows.reduce((s, r) => s + Number(r.amount), 0);
  await prisma.dailyReport.update({
    where: { id: reportId },
    data: { totalRevenue: BigInt(Math.round(revSum)), totalExpense: BigInt(Math.round(expSum)) },
  });
  return { ymd, rev: revLines.length, exp: expRows.length, maint: maintRows.length, inv: matRows.length + fuelRows.length };
}

const all = dates();
console.log(`seeding ${all.length} days (${all[0].toISOString().slice(0, 10)} → ${all[all.length - 1].toISOString().slice(0, 10)})…`);
let counts = { rev: 0, exp: 0, maint: 0, inv: 0 };
for (const d of all) {
  const r = await seedDay(d);
  counts = { rev: counts.rev + r.rev, exp: counts.exp + r.exp, maint: counts.maint + r.maint, inv: counts.inv + r.inv };
  if (all.indexOf(d) % 15 === 0) console.log(`  ${r.ymd}: rev=${r.rev} exp=${r.exp} maint=${r.maint} inv=${r.inv}`);
}
console.log(`done: reports=${all.length} revenueLines=${counts.rev} expenseLines=${counts.exp} maintenanceLines=${counts.maint} inventoryEntries=${counts.inv}`);
await prisma.$disconnect();
