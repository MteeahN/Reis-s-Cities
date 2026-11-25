/** What a place is called by its population (shown next to the city name). */
export const SETTLEMENT_TIERS: { min: number; name: string }[] = [
  { min: 0, name: 'Köy' },
  { min: 500, name: 'Belde' },
  { min: 2000, name: 'Kasaba' },
  { min: 10000, name: 'Şehir' },
  { min: 50000, name: 'Büyükşehir' },
  { min: 200000, name: 'Metropol' },
];

export function settlementOf(population: number): { name: string; next: { min: number; name: string } | null } {
  let i = 0;
  while (i + 1 < SETTLEMENT_TIERS.length && population >= SETTLEMENT_TIERS[i + 1].min) i++;
  return { name: SETTLEMENT_TIERS[i].name, next: SETTLEMENT_TIERS[i + 1] ?? null };
}
