import { LOAN_OFFERS, MAX_LOANS, TAX, type TaxKind } from '../../game/data/economy';
import type { DayLedger } from '../../game/systems/Economy';
import { getGame } from '../../store/gameBridge';
import { useGameStore } from '../../store/gameStore';
import { formatMoney } from '../../utils/format';

const TAX_ROWS: { kind: TaxKind; label: string; rate: 'taxResidential' | 'taxCommercial' | 'taxIndustrial'; effect: string }[] = [
  { kind: 'residential', label: 'Konut', rate: 'taxResidential', effect: 'mutluluk ve göç' },
  { kind: 'commercial', label: 'Ticaret ve ofis', rate: 'taxCommercial', effect: 'ticaret ve ofis talebi' },
  { kind: 'industrial', label: 'Sanayi', rate: 'taxIndustrial', effect: 'sanayi talebi' },
];

const signed = (v: number) => `${v >= 0 ? '+' : '−'}${formatMoney(Math.abs(v))}`;

function Line({ k, v, note, testId }: { k: string; v: number | null; note?: string; testId?: string }) {
  return (
    <div className="kv">
      <span>
        {k}
        {note && <em className="line-note"> · {note}</em>}
      </span>
      <strong className={v === null ? 'muted' : v >= 0 ? 'text-green' : 'text-red'} data-testid={testId}>
        {v === null ? '—' : signed(v)}
      </strong>
    </div>
  );
}

/** Net per day for the last days, green above zero and red below. */
function History({ days }: { days: DayLedger[] }) {
  if (days.length === 0) return <p className="hint">Geçmiş, ilk gün tamamlanınca görünür.</p>;
  const max = Math.max(1, ...days.map((d) => Math.abs(d.net)));
  const W = 272;
  const H = 60;
  const bw = W / 14;
  return (
    <svg className="history" width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Son günlerin net bakiyesi">
      <line x1={0} x2={W} y1={H / 2} y2={H / 2} className="axis" />
      {days.map((d, i) => {
        const h = (Math.abs(d.net) / max) * (H / 2 - 3);
        const x = W - (days.length - i) * bw + 2;
        return (
          <rect key={d.day} x={x} width={bw - 4} y={d.net >= 0 ? H / 2 - h : H / 2} height={Math.max(1, h)} rx={2} className={d.net >= 0 ? 'pos' : 'neg'}>
            <title>{`Gün ${d.day}: ${signed(d.net)} (gelir ${formatMoney(d.income)}, gider ${formatMoney(d.expenses)})`}</title>
          </rect>
        );
      })}
    </svg>
  );
}

export function EconomyTab() {
  const eco = useGameStore((s) => s.economy);
  if (!eco) return null;
  const r = eco.rates;
  const income = r.taxResidential + r.taxCommercial + r.taxIndustrial + (r.transitFares ?? 0);
  const expenses = r.upkeepRoads + r.upkeepBuildings + r.upkeepPower + r.upkeepWater + r.upkeepServices + (r.upkeepTransit ?? 0) + r.loanPayments;
  const t = eco.today.lines;
  const construction = (t.constructionRoads ?? 0) + (t.constructionBuildings ?? 0) + (t.constructionInfra ?? 0);

  return (
    <div className="tab-body" data-testid="economy">
      <div className={`balance-big ${eco.balance < 0 ? 'bad' : ''}`} data-testid="eco-balance">
        {eco.balance < 0 ? '−' : ''}
        {formatMoney(Math.abs(eco.balance))}
      </div>
      <div className="kv">
        <span>Tahmini net</span>
        <strong className={eco.projectedDaily >= 0 ? 'text-green' : 'text-red'} data-testid="eco-net">
          {signed(eco.projectedDaily)}/gün · {signed(eco.projectedDaily * 7)}/hafta
        </strong>
      </div>
      {eco.inDebt && (
        <div className="notice bad">
          Bütçe açığı{eco.daysInDebt > 0 ? ` (${eco.daysInDebt} gün)` : ''}: inşaat yapılamaz, vatandaş mutluluğu düşer.
        </div>
      )}

      <div className="section-title">Vergiler</div>
      {TAX_ROWS.map((row) => {
        const rate = eco.taxRates[row.kind];
        const diff = rate - TAX.neutral;
        return (
          <div className="tax-row" key={row.kind}>
            <div className="tax-head">
              <span>{row.label}</span>
              <strong data-testid={`tax-${row.kind}-value`}>%{rate}</strong>
            </div>
            <input
              type="range"
              min={TAX.min}
              max={TAX.max}
              step={1}
              value={rate}
              onChange={(e) => getGame()?.setTaxRate(row.kind, Number(e.target.value))}
              aria-label={`${row.label} vergisi`}
              data-testid={`tax-${row.kind}`}
            />
            <div className="tax-foot">
              <span className={diff > 0 ? 'text-yellow' : diff < 0 ? 'text-green' : 'muted'}>
                {diff === 0 ? 'Nötr' : diff > 0 ? `Yüksek: ${row.effect} düşer` : `Düşük: ${row.effect} artar`}
              </span>
              <span>{signed(r[row.rate])}/gün</span>
            </div>
          </div>
        );
      })}

      <div className="section-title">Günlük gelir</div>
      <Line k="Konut vergisi" v={r.taxResidential} testId="eco-tax-r" />
      <Line k="Ticaret vergisi" v={r.taxCommercial} />
      <Line k="Sanayi vergisi" v={r.taxIndustrial} />
      {(r.transitFares ?? 0) > 0 && <Line k="Otobüs biletleri" v={r.transitFares} testId="eco-transit-fares" />}
      <div className="section-title">Günlük gider</div>
      <Line k="Yol bakımı" v={-r.upkeepRoads} testId="eco-upkeep-roads" />
      <Line k="Bina bakımı" v={-r.upkeepBuildings} />
      {r.loanPayments > 0 && <Line k="Kredi ödemeleri" v={-r.loanPayments} />}
      <Line k="Elektrik" v={-r.upkeepPower} note="santraller, hatlar" testId="eco-upkeep-power" />
      <Line k="Su ve kanalizasyon" v={-r.upkeepWater} note="tesisler, borular" />
      <Line k="Kamu hizmetleri" v={-r.upkeepServices} note="polis, itfaiye, sağlık, eğitim, çöp, park" />
      {(r.upkeepTransit ?? 0) > 0 && <Line k="Otobüs işletmesi" v={-r.upkeepTransit} note="otobüs başına günlük bakım" />}
      <div className="kv total">
        <span>Toplam</span>
        <strong className={income - expenses >= 0 ? 'text-green' : 'text-red'}>{signed(income - expenses)}/gün</strong>
      </div>

      <div className="section-title">Bugün (gerçekleşen)</div>
      <Line k="Gelir" v={eco.today.income - (t.loan ?? 0) - (t.refunds ?? 0) - (t.reward ?? 0)} />
      {(t.reward ?? 0) > 0 && <Line k="Görev ödülleri" v={t.reward ?? 0} />}
      <Line k="İşletme giderleri" v={-(eco.today.expenses + construction)} />
      {construction < 0 && <Line k="İnşaat" v={construction} />}

      <div className="section-title">Son 14 gün (net)</div>
      <History days={eco.history} />

      <div className="section-title">Krediler</div>
      {!Number.isFinite(eco.balance) && <p className="hint">Yaratıcı modda para sınırsız; kredi gerekmez.</p>}
      {Number.isFinite(eco.balance) && eco.loans.map((l) => (
        <div className="loan" key={l.id} data-testid="loan-active">
          <div>
            <strong>{formatMoney(l.amount)}</strong>
            <span className="muted small"> · kalan {formatMoney(l.remaining)} · {formatMoney(l.dailyPayment)}/gün · {l.daysLeft} gün</span>
          </div>
          <button className="btn secondary small-btn" onClick={() => getGame()?.repayLoan(l.id)}>Kapat</button>
        </div>
      ))}
      {Number.isFinite(eco.balance) && LOAN_OFFERS.map((o) => (
        <div className="loan offer" key={o.id}>
          <div>
            <strong>{formatMoney(o.amount)}</strong>
            <span className="muted small"> · %{Math.round(o.interest * 100)} faiz · {o.days} gün</span>
          </div>
          <button
            className="btn secondary small-btn"
            disabled={eco.loans.length >= MAX_LOANS}
            onClick={() => getGame()?.takeLoan(o.id)}
            data-testid={`loan-take-${o.id}`}
          >
            Al
          </button>
        </div>
      ))}
    </div>
  );
}
