import { useState } from 'react';
import { CELL_SIZE, GRID_CELLS, WORLD_SIZE } from '../../game/core/config';
import { AGE_GROUPS, EDUCATION_LEVELS } from '../../game/simulation/Population';
import { useGameStore } from '../../store/gameStore';
import { EconomyTab } from './EconomyTab';
import { formatMeters, formatMoney, formatNumber } from '../../utils/format';
import { Icon } from '../components/Icon';

type Tab = 'city' | 'people' | 'economy' | 'world' | 'perf';

const QUALITY_LABEL = { high: 'Yüksek', medium: 'Orta', low: 'Düşük' } as const;

function Row({ k, v, testId }: { k: string; v: string; testId?: string }) {
  return (
    <div className="kv">
      <span>{k}</span>
      <strong data-testid={testId}>{v}</strong>
    </div>
  );
}

function Bar({ value, tone }: { value: number; tone: string }) {
  return (
    <div className="bar">
      <span className={tone} style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
    </div>
  );
}

function WorldTab() {
  const world = useGameStore((s) => s.world);
  if (!world) return null;
  return (
    <div className="tab-body">
      <Row k="Harita" v={`${GRID_CELLS}×${GRID_CELLS} hücre`} />
      <Row k="Alan" v={`${(WORLD_SIZE / 1000).toFixed(2)} × ${(WORLD_SIZE / 1000).toFixed(2)} km`} />
      <Row k="Hücre boyutu" v={`${CELL_SIZE} × ${CELL_SIZE} m`} />
      <Row k="Harita tohumu" v={String(world.seed)} testId="world-seed" />
      <div className="section-title">Arazi</div>
      <Row k="Sahip olunan arazi" v={`%${world.unlockedPct.toFixed(0)}`} />
      <Bar value={world.unlockedPct} tone="fill-yellow" />
      <Row k="İnşaata uygun" v={`%${world.buildablePct.toFixed(0)}`} />
      <Bar value={world.buildablePct} tone="fill-green" />
      <Row k="Su yüzeyi" v={`%${world.waterPct.toFixed(1)}`} />
      <Bar value={world.waterPct * 4} tone="fill-blue" />
      <Row k="Ağaç ve kaya" v={formatNumber(world.vegetationCount)} />
    </div>
  );
}

const pct = (v: number) => `%${Math.round(v * 100)}`;

function Supply({ label, used, total, unit, testId }: { label: string; used: number; total: number; unit: string; testId?: string }) {
  const ratio = total > 0 ? used / total : used > 0 ? 1 : 0;
  return (
    <>
      <Row k={label} v={`${Math.round(used).toLocaleString('tr-TR')} / ${Math.round(total).toLocaleString('tr-TR')} ${unit}`} testId={testId} />
      <Bar value={ratio * 100} tone={ratio > 0.95 ? 'fill-red' : ratio > 0.8 ? 'fill-yellow' : 'fill-green'} />
    </>
  );
}

function InfraStats() {
  const p = useGameStore((st) => st.population);
  if (!p) return null;
  const u = p.utilities;
  const demandShort = (d: number, s: number) => (d > s ? `(talep ${Math.round(d).toLocaleString('tr-TR')})` : '');
  return (
    <>
      <div className="section-title">Altyapı</div>
      <Supply label={`Elektrik (kW) ${demandShort(u.powerDemand, u.powerServed)}`} used={u.powerServed} total={u.powerProduced} unit="" testId="stat-power" />
      <Supply label={`Su (m³/gün) ${demandShort(u.waterDemand, u.waterServed)}`} used={u.waterServed} total={u.waterProduced} unit="" testId="stat-water" />
      <Supply label={`Atık su (m³/gün) ${demandShort(u.sewageDemand, u.sewageServed)}`} used={u.sewageServed} total={u.sewageCapacity} unit="" />
      {(p.problems.power > 0 || p.problems.water > 0 || p.problems.sewage > 0) && (
        <p className="hint warn-text" data-testid="infra-problems">
          Elektriksiz {p.problems.power} · susuz {p.problems.water} · kanalizasyonsuz {p.problems.sewage} bina
        </p>
      )}
      <div className="section-title">Hizmetler (nüfus kapsaması)</div>
      <Row k="Polis / İtfaiye" v={`${pct(p.coverage.police)} / ${pct(p.coverage.fire)}`} />
      <Row k="Sağlık / Çöp" v={`${pct(p.coverage.health)} / ${pct(p.coverage.garbage)}`} />
      <Row k="İlkokul / Lise" v={`${pct(p.coverage.education)} / ${pct(p.coverage.highEducation)}`} />
      <Row k="Ortalama sağlık" v={`%${Math.round(p.health)}`} />
      <Row k="Suç oranı" v={String(Math.round(p.crime))} />
      {p.problems.burning > 0 && <p className="hint warn-text">Yanan bina: {p.problems.burning}</p>}
    </>
  );
}

function TrafficStats() {
  const p = useGameStore((st) => st.population);
  if (!p) return null;
  const t = p.traffic;
  const tone = t.congestion >= 0.9 ? 'fill-red' : t.congestion >= 0.6 ? 'fill-yellow' : 'fill-green';
  return (
    <>
      <div className="section-title">Trafik</div>
      <Row k="Yoldaki araç" v={formatNumber(Math.round(t.vehicles))} testId="stat-vehicles" />
      <Row k="Sefer / saat" v={formatNumber(Math.round(t.tripsPerHour))} testId="stat-trips" />
      <Row k="Ortalama yoğunluk" v={`%${Math.round(t.congestion * 100)}`} testId="stat-congestion" />
      <Bar value={t.congestion * 100} tone={tone} />
      <Row k="Ortalama hız" v={t.avgSpeedKmh > 0 ? `${Math.round(t.avgSpeedKmh)} km/s` : '—'} />
      <Row k="İşe ulaşım (ort.)" v={t.commuteMinutes > 0 ? `${t.commuteMinutes.toFixed(1)} dk` : '—'} testId="stat-commute" />
      {t.congestedLength > 0 && <Row k="Tıkalı yol" v={formatMeters(t.congestedLength)} />}
      {t.unroutable >= 1 && (
        <p className="hint warn-text" data-testid="traffic-unroutable">
          Günde {formatNumber(Math.round(t.unroutable))} yolculuk rota bulamıyor: yol ağı bağlantısız.
        </p>
      )}
    </>
  );
}

function CityTab() {
  const s = useGameStore((st) => st.cityStats);
  const budget = useGameStore((st) => st.budget);
  if (!s) return null;
  return (
    <div className="tab-body" data-testid="city-stats">
      <Row k="Bütçe" v={formatMoney(budget)} />
      <div className="section-title">Yol ağı</div>
      <Row k="Toplam uzunluk" v={formatMeters(s.roadLength)} testId="stat-road-length" />
      <Row k="Yol parçası" v={formatNumber(s.roadSegments)} testId="stat-road-segments" />
      <Row k="Kavşak" v={formatNumber(s.junctions)} testId="stat-junctions" />
      <Row k="Çıkmaz" v={formatNumber(s.deadEnds)} />
      <div className="section-title">Yapılar</div>
      <Row k="Bina" v={formatNumber(s.buildings)} testId="stat-buildings" />
      <InfraStats />
      <TrafficStats />
      <div className="section-title">Harcamalar</div>
      <Row k="Yollar" v={formatMoney(s.spentRoads)} />
      <Row k="Binalar" v={formatMoney(s.spentBuildings)} />
    </div>
  );
}

function Split({ parts }: { parts: { label: string; value: number; tone: string }[] }) {
  const total = parts.reduce((s, p) => s + p.value, 0) || 1;
  return (
    <>
      <div className="split">
        {parts.map((p) => (
          <span key={p.label} className={p.tone} style={{ width: `${(p.value / total) * 100}%` }} title={`${p.label}: ${Math.round(p.value)}`} />
        ))}
      </div>
      <div className="split-legend">
        {parts.map((p) => (
          <span key={p.label}><i className={p.tone} /> {p.label} %{Math.round((p.value / total) * 100)}</span>
        ))}
      </div>
    </>
  );
}

function PeopleTab() {
  const p = useGameStore((s) => s.population);
  const demand = useGameStore((s) => s.demand);
  if (!p || p.total < 1) {
    return (
      <div className="tab-body muted" data-testid="people-stats">
        Henüz kimse yaşamıyor. Bir yol çizip kenarlarını konut bölgesi yapın (Z); binalar kendiliğinden gelişir.
      </div>
    );
  }
  return (
    <div className="tab-body" data-testid="people-stats">
      <Row k="Nüfus" v={formatNumber(Math.round(p.total))} testId="stat-population" />
      <Row k="Hane (konut binası)" v={formatNumber(p.households)} />
      <Row k="Konut kapasitesi" v={`${formatNumber(p.housingCapacity)} (boş ${formatNumber(Math.round(p.vacantHomes))})`} />
      <Row k="Mutluluk" v={`%${Math.round(p.happiness)}`} />
      <Row k="Gürültü (ort.)" v={String(Math.round(p.noise))} />
      <div className="section-title">Mutluluk etkenleri</div>
      <div className="factors" data-testid="happiness-factors">
        {p.happinessFactors
          .filter((f) => f.label === 'Temel' || Math.abs(f.value) >= 0.5)
          .map((f) => (
            <div className="kv" key={f.label}>
              <span>{f.label}</span>
              <strong className={f.label === 'Temel' ? 'muted' : f.value >= 0 ? 'text-green' : 'text-red'}>
                {f.value >= 0 ? '+' : '−'}
                {Math.abs(f.value).toFixed(1)}
              </strong>
            </div>
          ))}
      </div>
      <div className="section-title">Yaş grupları</div>
      <Split parts={AGE_GROUPS.map((label, i) => ({ label, value: p.ages[i], tone: AGE_TONES[i] }))} />
      <div className="section-title">Çalışma</div>
      <Row k="İş gücü" v={formatNumber(Math.round(p.labor))} />
      <Row k="Çalışan" v={formatNumber(Math.round(p.employed))} />
      <Row k="İş yeri kapasitesi" v={formatNumber(p.jobs)} />
      <Row k="İşsizlik" v={`%${(p.unemploymentRate * 100).toFixed(1)}`} testId="stat-unemployment" />
      <Row k="İşsiz (eğitimsiz / temel / yüksek)" v={p.unemployedByEdu.map((v) => Math.round(v)).join(' / ')} />
      <Row k="Boş iş (eğitimsiz / temel / yüksek)" v={p.vacancies.map((v) => Math.round(v)).join(' / ')} testId="stat-vacancies" />
      {p.vacancies[2] >= 1 && <p className="hint warn-text">Yüksek eğitimli eleman açığı var: liselerle kapsamı artırın (Hizmetler).</p>}
      <div className="section-title">Eğitim</div>
      <Split parts={EDUCATION_LEVELS.map((label, i) => ({ label, value: p.education[i], tone: EDU_TONES[i] }))} />
      <div className="section-title">Gelir</div>
      <Split parts={[{ label: 'Düşük', value: p.income.low, tone: 'fill-yellow' }, { label: 'Orta', value: p.income.mid, tone: 'fill-blue' }, { label: 'Yüksek', value: p.income.high, tone: 'fill-green' }]} />
      <div className="section-title">Dün</div>
      <Row k="Taşınan / ayrılan" v={`+${Math.round(p.yesterday.moveIns)} / −${Math.round(p.yesterday.moveOuts)}`} />
      <Row k="Doğum / ölüm" v={`${Math.round(p.yesterday.births)} / ${Math.round(p.yesterday.deaths)}`} />
      <div className="section-title">Binalar</div>
      <Row k="Konut / Ticaret / Sanayi" v={`${p.buildingsByZone.residential} / ${p.buildingsByZone.commercial} / ${p.buildingsByZone.industrial}`} />
      <Row k="İnşaat hâlinde" v={formatNumber(p.underConstruction)} />
      {p.abandoned > 0 && <Row k="Terk edilmiş" v={formatNumber(p.abandoned)} />}
      <Row k="Talep K / T / S" v={`${Math.round(demand.residential)} / ${Math.round(demand.commercial)} / ${Math.round(demand.industrial)}`} />
    </div>
  );
}

const AGE_TONES = ['fill-yellow', 'fill-blue', 'fill-green', 'fill-gray'];
const EDU_TONES = ['fill-gray', 'fill-blue', 'fill-green'];

function PerfTab() {
  const perf = useGameStore((s) => s.perf);
  const preset = useGameStore((s) => s.settings.graphics.preset);
  if (!perf) return <div className="tab-body muted">Ölçülüyor…</div>;
  const fpsTone = perf.fps >= 55 ? 'good' : perf.fps >= 30 ? 'ok' : 'bad';
  return (
    <div className="tab-body">
      <div className={`fps-big ${fpsTone}`} data-testid="fps">
        {perf.fps.toFixed(0)} <small>FPS</small>
      </div>
      <Row k="Kare süresi" v={`${perf.frameMs.toFixed(1)} ms`} />
      <Row k="Çizim çağrısı" v={formatNumber(perf.drawCalls)} />
      <Row k="Üçgen" v={formatNumber(perf.triangles)} />
      <Row k="Grafik kalitesi" v={preset === 'custom' ? 'Özel' : `${QUALITY_LABEL[perf.quality]}${preset === 'auto' ? ' (otomatik)' : ''}`} />
    </div>
  );
}

export function LeftPanel() {
  const open = useGameStore((s) => s.leftPanelOpen);
  const set = useGameStore((s) => s.set);
  const [tab, setTab] = useState<Tab>('city');

  if (!open) {
    return (
      <button className="panel left-collapsed icon-btn" onClick={() => set({ leftPanelOpen: true })} title="Şehir panelini aç">
        <Icon name="chart" size={18} />
      </button>
    );
  }
  return (
    <aside className="panel left-panel" data-testid="left-panel">
      <div className="panel-header">
        <div className="tabs" role="tablist">
          <button role="tab" aria-selected={tab === 'city'} className={tab === 'city' ? 'active' : ''} onClick={() => setTab('city')} data-testid="tab-city">
            <Icon name="chart" size={14} /> Şehir
          </button>
          <button role="tab" aria-selected={tab === 'people'} className={tab === 'people' ? 'active' : ''} onClick={() => setTab('people')} data-testid="tab-people">
            <Icon name="people" size={14} /> Nüfus
          </button>
          <button role="tab" aria-selected={tab === 'economy'} className={tab === 'economy' ? 'active' : ''} onClick={() => setTab('economy')} data-testid="tab-economy">
            <Icon name="money" size={14} /> Bütçe
          </button>
          <button role="tab" aria-selected={tab === 'world'} className={tab === 'world' ? 'active' : ''} onClick={() => setTab('world')} data-testid="tab-world">
            <Icon name="globe" size={14} /> Dünya
          </button>
          <button role="tab" aria-selected={tab === 'perf'} className={tab === 'perf' ? 'active' : ''} onClick={() => setTab('perf')} data-testid="tab-perf">
            <Icon name="gauge" size={14} /> FPS
          </button>
        </div>
        <button className="icon-btn small" onClick={() => set({ leftPanelOpen: false })} title="Paneli kapat">
          <Icon name="chevronLeft" size={16} />
        </button>
      </div>
      {tab === 'city' ? <CityTab /> : tab === 'people' ? <PeopleTab /> : tab === 'economy' ? <EconomyTab /> : tab === 'world' ? <WorldTab /> : <PerfTab />}
    </aside>
  );
}
