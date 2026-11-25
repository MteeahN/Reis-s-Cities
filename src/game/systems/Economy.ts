import { BANKRUPTCY_WARNING, LEDGER_HISTORY_DAYS, LOAN_OFFERS, MAX_LOANS, TAX, type TaxKind } from '../data/economy';
import type { FlowCategory, Treasury } from './Treasury';

export interface DailyRates {
  taxResidential: number;
  taxCommercial: number;
  taxIndustrial: number;
  upkeepRoads: number;
  upkeepBuildings: number;
  upkeepPower: number;
  upkeepWater: number;
  upkeepServices: number;
  /** Bus fares (income). */
  transitFares: number;
  /** Bus upkeep. */
  upkeepTransit: number;
  /** Surplus electricity, water and sewage treatment sold to the neighbouring towns (income). */
  exportSales: number;
  loanPayments: number;
}

export interface DayLedger {
  day: number;
  lines: Partial<Record<FlowCategory, number>>;
  income: number;
  expenses: number;
  net: number;
}

export interface Loan {
  id: number;
  offerId: string;
  amount: number;
  /** Principal + interest still owed. */
  remaining: number;
  dailyPayment: number;
  daysLeft: number;
}

export interface EconomySave {
  taxRates: Record<TaxKind, number>;
  /** Daily cash flow rates at save time (shown until the next simulation step). */
  rates?: DailyRates;
  today: DayLedger;
  history: DayLedger[];
  loans: Loan[];
  daysInDebt: number;
  nextLoanId: number;
  loansRepaid?: number;
}

export type EconomyNotice = { kind: 'info' | 'warning' | 'error' | 'success'; text: string };

const emptyDay = (day: number): DayLedger => ({ day, lines: {}, income: 0, expenses: 0, net: 0 });

export const ZERO_RATES: DailyRates = {
  taxResidential: 0,
  taxCommercial: 0,
  taxIndustrial: 0,
  upkeepRoads: 0,
  upkeepBuildings: 0,
  upkeepPower: 0,
  upkeepWater: 0,
  upkeepServices: 0,
  transitFares: 0,
  upkeepTransit: 0,
  exportSales: 0,
  loanPayments: 0,
};

/**
 * Municipal economy: tax rates, the daily cash flow (applied continuously in
 * small steps), a ledger of real transactions per game day, loans, and debt
 * tracking. Rates are computed by the simulation from the workforce.
 */
export class Economy {
  readonly taxRates: Record<TaxKind, number> = { residential: TAX.default, commercial: TAX.default, industrial: TAX.default };
  rates: DailyRates = { ...ZERO_RATES };
  today: DayLedger = emptyDay(0);
  readonly history: DayLedger[] = [];
  readonly loans: Loan[] = [];
  daysInDebt = 0;
  /** Loans paid off in full (by instalments or early repayment). */
  loansRepaid = 0;
  private nextLoanId = 1;
  private warnedDebt = false;
  private warnedBankrupt = false;
  private listeners = new Set<(n: EconomyNotice) => void>();

  constructor(private readonly treasury: Treasury) {
    treasury.onFlow((cat, amount) => {
      const l = this.today.lines;
      l[cat] = (l[cat] ?? 0) + amount;
      if (amount >= 0) this.today.income += amount;
      else this.today.expenses -= amount;
      this.today.net = this.today.income - this.today.expenses;
    });
    treasury.onChange((balance) => this.checkDebt(balance));
  }

  serialize(): EconomySave {
    return {
      taxRates: { ...this.taxRates },
      rates: { ...this.rates },
      today: { ...this.today, lines: { ...this.today.lines } },
      history: this.history.map((d) => ({ ...d, lines: { ...d.lines } })),
      loans: this.loans.map((l) => ({ ...l })),
      daysInDebt: this.daysInDebt,
      nextLoanId: this.nextLoanId,
      loansRepaid: this.loansRepaid,
    };
  }

  restore(s: EconomySave): void {
    for (const k of ['residential', 'commercial', 'industrial'] as const) this.setTax(k, s.taxRates[k]);
    if (s.rates) this.rates = { ...ZERO_RATES, ...s.rates };
    this.today = { ...s.today, lines: { ...s.today.lines } };
    this.history.length = 0;
    this.history.push(...s.history.slice(-LEDGER_HISTORY_DAYS));
    this.loans.length = 0;
    this.loans.push(...s.loans.map((l) => ({ ...l })));
    this.daysInDebt = s.daysInDebt;
    this.loansRepaid = s.loansRepaid ?? 0;
    this.nextLoanId = Math.max(s.nextLoanId, ...this.loans.map((l) => l.id + 1), 1);
    // Debt warnings were already shown before the save.
    this.warnedDebt = this.inDebt;
    this.warnedBankrupt = this.treasury.balance < BANKRUPTCY_WARNING;
  }

  onNotice(fn: (n: EconomyNotice) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private notify(n: EconomyNotice): void {
    this.listeners.forEach((l) => l(n));
  }

  setTax(kind: TaxKind, value: number): void {
    this.taxRates[kind] = Math.max(TAX.min, Math.min(TAX.max, Math.round(value)));
  }

  /** Percentage points above the neutral rate (negative when below). */
  taxPressure(kind: TaxKind): number {
    return this.taxRates[kind] - TAX.neutral;
  }

  get inDebt(): boolean {
    return this.treasury.balance < 0;
  }

  /** Projected net per day at current rates (taxes − upkeep − loan payments). */
  projectedDailyNet(): number {
    const r = this.rates;
    return r.taxResidential + r.taxCommercial + r.taxIndustrial + r.transitFares + (r.exportSales ?? 0) - r.upkeepRoads - r.upkeepBuildings - r.upkeepPower - r.upkeepWater - r.upkeepServices - r.upkeepTransit - r.loanPayments;
  }

  /** Applies `days` (fraction of a game day) of income and expenses. */
  apply(input: Partial<Omit<DailyRates, 'loanPayments'>>, days: number): void {
    const rates = { ...ZERO_RATES, ...input };
    const loanPayments = this.loans.reduce((s, l) => s + l.dailyPayment, 0);
    this.rates = { ...rates, loanPayments };
    const t = this.treasury;
    t.credit(rates.taxResidential * days, 'taxResidential');
    t.credit(rates.taxCommercial * days, 'taxCommercial');
    t.credit(rates.taxIndustrial * days, 'taxIndustrial');
    t.charge(rates.upkeepRoads * days, 'upkeepRoads');
    t.charge(rates.upkeepBuildings * days, 'upkeepBuildings');
    t.charge(rates.upkeepPower * days, 'upkeepPower');
    t.charge(rates.upkeepWater * days, 'upkeepWater');
    t.charge(rates.upkeepServices * days, 'upkeepServices');
    t.credit(rates.transitFares * days, 'transitFares');
    t.charge(rates.upkeepTransit * days, 'upkeepTransit');
    t.credit((rates.exportSales ?? 0) * days, 'exportSales');
    for (const loan of this.loans) {
      const pay = Math.min(loan.remaining, loan.dailyPayment * days);
      loan.remaining -= pay;
      t.charge(pay, 'loanPayment');
    }
    for (let i = this.loans.length - 1; i >= 0; i--) {
      if (this.loans[i].remaining <= 0.01) {
        this.notify({ kind: 'success', text: `${formatTL(this.loans[i].amount)} kredi tamamen ödendi` });
        this.loans.splice(i, 1);
        this.loansRepaid++;
      }
    }
  }

  /** Closes the current day's ledger. */
  rollDay(day: number): void {
    this.history.push(this.today);
    if (this.history.length > LEDGER_HISTORY_DAYS) this.history.shift();
    this.today = emptyDay(day);
    for (const l of this.loans) l.daysLeft = Math.max(0, l.daysLeft - 1);
    this.daysInDebt = this.inDebt ? this.daysInDebt + 1 : 0;
    if (this.daysInDebt === 3) this.notify({ kind: 'error', text: 'Şehir 3 gündür borçta: vergileri gözden geçirin veya kredi alın' });
  }

  takeLoan(offerId: string): Loan | null {
    const offer = LOAN_OFFERS.find((o) => o.id === offerId);
    if (!offer || this.loans.length >= MAX_LOANS || this.treasury.unlimited) return null;
    const total = offer.amount * (1 + offer.interest);
    const loan: Loan = { id: this.nextLoanId++, offerId, amount: offer.amount, remaining: total, dailyPayment: total / offer.days, daysLeft: offer.days };
    this.loans.push(loan);
    this.treasury.credit(offer.amount, 'loan');
    return loan;
  }

  /** Pays off the rest of a loan at once (requires the funds). */
  repayLoan(id: number): boolean {
    const i = this.loans.findIndex((l) => l.id === id);
    if (i < 0) return false;
    const loan = this.loans[i];
    if (!this.treasury.canAfford(loan.remaining)) return false;
    this.treasury.charge(loan.remaining, 'loanPayment');
    this.loans.splice(i, 1);
    this.loansRepaid++;
    return true;
  }

  private checkDebt(balance: number): void {
    if (balance < 0 && !this.warnedDebt) {
      this.warnedDebt = true;
      this.notify({ kind: 'warning', text: 'Bütçe açığı! Yeni inşaat yapılamaz ve vatandaşlar huzursuz.' });
    } else if (balance >= 0) this.warnedDebt = false;
    if (balance < BANKRUPTCY_WARNING && !this.warnedBankrupt) {
      this.warnedBankrupt = true;
      this.notify({ kind: 'error', text: 'İflasın eşiğindesiniz: giderleri azaltın veya vergileri artırın' });
    } else if (balance >= BANKRUPTCY_WARNING / 2) this.warnedBankrupt = false;
  }
}

const formatTL = (v: number) => `₺${Math.round(v).toLocaleString('tr-TR')}`;
