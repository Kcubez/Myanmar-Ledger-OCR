/**
 * One-time backfill: fuel rows extracted before the particular-only change
 * carry the machine name in `vehicle` with empty `particular`.
 * Moves vehicle -> particular and clears vehicle. Idempotent.
 *
 * Usage: npx tsx --env-file=.env.local scripts/backfill-fuel-particular.mts
 */
import { prisma } from "../lib/prisma";

const pending = await prisma.fuelEntry.count({
  where: {
    AND: [{ OR: [{ particular: null }, { particular: "" }] }, { vehicle: { not: "" } }],
  },
});
console.log(`rows needing backfill: ${pending}`);

if (pending > 0) {
  const moved = await prisma.$executeRaw`
    UPDATE "fuel_entry"
    SET "particular" = "vehicle", "vehicle" = ''
    WHERE ("particular" IS NULL OR "particular" = '') AND "vehicle" <> ''`;
  console.log(`backfilled rows: ${moved}`);
} else {
  console.log("nothing to do.");
}

await prisma.$disconnect();