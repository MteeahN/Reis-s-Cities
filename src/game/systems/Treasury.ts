import { STARTING_BUDGET } from '../core/config';

/** Construction categories (spent only if affordable). */
export type LedgerCategory = 'roads' | 'buildings' | 'infra';

/** Every money flow, for the budget report. Positive = income. */
export type FlowCategory =
  | 'taxResidential'
  | 'taxCommercial'
  | 'taxIndustrial'
  | 'upkeepRoads'
  | 'upkeepBuildings'
  | 'upkeepPower'
  | 'upkeepWater'
  | 'upkeepServices'
  | 'constructionInfra'
  | 'constructionRoads'
  | 'constructionBuildings'
  | 'refunds'
  | 'loan'
  | 'loanPayment'
  /** Money paid out when the city completes a mission. */
  | 'reward';

/**
 * Municipal treasury. Construction requires funds up front; recurring costs
 * (upkeep, loan payments) are charged even when that pushes the balance
 * below zero — the city can fall into deficit.
 */
export class Treasury {
  private _balance: number;
  private _unlimited = false;
  readonly spent: Record<LedgerCategory, number> = { roads: 0, buildings: 0, infra: 0 };
  readonly refunded: Record<LedgerCategory, number> = { roads: 0, buildings: 0, infra: 0 };
  private listeners = new Set<(balance: number) => void>();
  private flowListeners = new Set<(cat: FlowCategory, amount: number) => void>();

  constructor(initial = STARTING_BUDGET) {
    this._balance = initial;
  }

  /** Spendable balance; Infinity in sandbox mode. */
  get balance(): number {
    return this._unlimited ? Infinity : this._balance;
  }

  /** The real ledger balance (finite; this is what gets saved). */
  get storedBalance(): number {
    return this._balance;
  }

  /** Sandbox mode: everything is affordable and nothing reduces the balance. */
  get unlimited(): boolean {
    return this._unlimited;
  }

  setUnlimited(): void {
    this._unlimited = true;
    this.listeners.forEach((l) => l(this.balance));
  }

  /** Restores a saved balance and ledger totals (no transactions are recorded). */
  restore(balance: number, spent: Record<LedgerCategory, number>, refunded: Record<LedgerCategory, number>): void {
    this._balance = balance;
    Object.assign(this.spent, spent);
    Object.assign(this.refunded, refunded);
    this.listeners.forEach((l) => l(this.balance));
  }

  canAfford(amount: number): boolean {
    return this._unlimited || amount <= this._balance;
  }

  /** Construction: deducts `amount` only if affordable. */
  spend(amount: number, category: LedgerCategory): boolean {
    if (amount < 0) throw new Error('spend: negative amount');
    if (!this.canAfford(amount)) return false;
    this.spent[category] += amount;
    this.flow(category === 'roads' ? 'constructionRoads' : category === 'infra' ? 'constructionInfra' : 'constructionBuildings', -amount);
    return true;
  }

  refund(amount: number, category: LedgerCategory): void {
    if (amount <= 0) return;
    this.refunded[category] += amount;
    this.flow('refunds', amount);
  }

  /** Income (taxes, loans). */
  credit(amount: number, category: FlowCategory): void {
    if (amount > 0) this.flow(category, amount);
  }

  /** Recurring cost; may take the balance negative. */
  charge(amount: number, category: FlowCategory): void {
    if (amount > 0) this.flow(category, -amount);
  }

  private flow(category: FlowCategory, signed: number): void {
    // Sandbox: flows are still reported (budget report stays meaningful) but the balance never moves.
    if (!this._unlimited) this._balance += signed;
    this.flowListeners.forEach((l) => l(category, signed));
    this.listeners.forEach((l) => l(this.balance));
  }

  onChange(fn: (balance: number) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  /** Every transaction, signed (income positive). */
  onFlow(fn: (category: FlowCategory, amount: number) => void): () => void {
    this.flowListeners.add(fn);
    return () => this.flowListeners.delete(fn);
  }
}
