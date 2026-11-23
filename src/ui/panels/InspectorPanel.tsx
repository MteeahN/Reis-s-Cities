import type { BuildingInfo, RoadInfo } from '../../game/core/events';
import { getBuilding } from '../../game/data/buildings';
import { getRoadType } from '../../game/data/roads';
import { LINE_TYPES } from '../../game/data/infrastructure';
import { getZone, ZoneType, type ZoneKind } from '../../game/data/zones';
import { TERRAIN_TYPE_LABEL, type CellInfo } from '../../game/world/WorldGrid';
import { getGame } from '../../store/gameBridge';
import { useGameStore } from '../../store/gameStore';
import { formatMeters, formatMoney, formatNumber } from '../../utils/format';
import { Icon } from '../components/Icon';

function KV({ k, v, cls, testId }: { k: string; v: React.ReactNode; cls?: string; testId?: string }) {
  return (
    <div className="kv">
      <span>{k}</span>
      <strong className={cls} data-testid={testId}>{v}</strong>
    </div>
  );
}

function Errors({ valid, errors, okText }: { valid: boolean; errors: string[]; okText: string }) {
  return valid ? (
    <div className="notice ok">{okText}</div>
  ) : (
    <ul className="notice bad" data-testid="plan-errors">
      {errors.map((e) => <li key={e}>{e}</li>)}
    </ul>
  );
}

function CellDetails({ cell, zone, landValue, pollution }: { cell: CellInfo; zone: number; landValue: number; pollution: number }) {
  return (
    <>
      <KV k="Bölge" v={zone ? getZone(zone as ZoneKind).name : 'Yok'} />
      <KV k="Arazi değeri" v={landValue} testId="cell-land-value" />
      {pollution > 0 && <KV k="Kirlilik" v={pollution} cls="text-yellow" />}
      <KV k="Hücre" v={`${cell.i}, ${cell.j}`} cls="mono" />
      <KV k="Chunk" v={`${cell.chunkX}, ${cell.chunkZ}`} cls="mono" />
      <KV k="Arazi tipi" v={TERRAIN_TYPE_LABEL[cell.type]} />
      <KV k="Yükseklik" v={`${cell.height.toFixed(1)} m`} />
      <KV k="Eğim" v={`%${(cell.slope * 100).toFixed(0)}`} />
      <KV k="Mülkiyet" v={cell.unlocked ? 'Şehre ait' : 'Satın alınmamış'} cls={cell.unlocked ? 'text-green' : 'text-yellow'} />
      <KV
        k="İnşaat"
        v={!cell.unlocked ? 'Arazi kilitli' : cell.buildable ? 'Uygun' : 'Uygun değil'}
        cls={cell.buildable && cell.unlocked ? 'text-green' : 'text-red'}
      />
    </>
  );
}

function RoadDetails({ road }: { road: RoadInfo }) {
  const endLabel = (d: number) => (d === 1 ? 'çıkmaz' : d === 2 ? 'bağlantı' : `${d} yollu kavşak`);
  return (
    <>
      <KV k="Uzunluk" v={formatMeters(road.length)} />
      <KV k="Genişlik / Şerit" v={`${road.width} m · ${road.lanes}${road.oneWay ? ' (tek yön)' : ''}`} />
      <KV k="Hız sınırı" v={`${road.speedKmh} km/s`} />
      <KV k="Kapasite" v={`${formatNumber(road.capacity)} araç/saat`} />
      <KV k="Uçlar" v={`${endLabel(road.degreeA)} · ${endLabel(road.degreeB)}`} />
      <KV k="İnşaat bedeli" v={formatMoney(road.cost)} />
      <KV k="Haftalık bakım" v={formatMoney(road.weeklyMaintenance)} />
      <div className="section-title">Trafik</div>
      {road.traffic ? (
        <>
          <KV
            k="Akış"
            v={road.oneWay ? `${formatNumber(Math.round(road.traffic.forward))} araç/saat` : `${formatNumber(Math.round(road.traffic.forward))} → · ← ${formatNumber(Math.round(road.traffic.backward))} araç/saat`}
            testId="road-flow"
          />
          <KV k="Doluluk (en yoğun yön)" v={`%${Math.round(road.traffic.ratio * 100)}`} cls={road.traffic.ratio >= 1 ? 'text-red' : road.traffic.ratio >= 0.7 ? 'text-yellow' : 'text-green'} testId="road-congestion" />
          <div className="bar"><span className={road.traffic.ratio >= 1 ? 'fill-red' : road.traffic.ratio >= 0.7 ? 'fill-yellow' : 'fill-green'} style={{ width: `${Math.min(100, road.traffic.ratio * 100)}%` }} /></div>
          <KV k="Ortalama hız" v={`${Math.round(road.traffic.speedKmh)} km/s`} />
          {road.traffic.ratio >= 1 && <p className="hint warn-text">Kapasite aşıldı: daha geniş yol veya alternatif bağlantı yapın.</p>}
        </>
      ) : (
        <p className="hint">Trafik verisi ilk güncellemede gelir.</p>
      )}
    </>
  );
}

const STATE_LABEL = { construction: 'İnşaat hâlinde', active: 'Faal', abandoned: 'Terk edilmiş', burning: 'Yanıyor!' } as const;

function GrowableDetails({ b }: { b: BuildingInfo }) {
  const home = b.zone === ZoneType.Residential;
  return (
    <>
      <div className="level-row" data-testid="building-level">
        {[1, 2, 3].map((l) => (
          <span key={l} className={`level-pip ${l <= b.level ? 'on' : ''}`} />
        ))}
        <span>Seviye {b.level}</span>
        <span className={`chip state-${b.state}`}>{STATE_LABEL[b.state]}</span>
      </div>
      {b.state === 'construction' && (
        <>
          <div className="bar"><span className="fill-yellow" style={{ width: `${Math.round(b.progress * 100)}%` }} /></div>
          <KV k="İnşaat" v={`%${Math.round(b.progress * 100)}`} />
        </>
      )}
      <KV k={home ? 'Sakinler' : 'Çalışanlar'} v={`${b.occupants} / ${b.capacity}`} testId="building-occupants" />
      <KV k="Kategori" v={b.category} />
      <KV k="Alan" v={`${b.w}×${b.d} hücre`} />
      <KV k="Arazi değeri" v={b.landValue} />
      {b.groundPollution > 0 && <KV k="Kirlilik (çevre)" v={b.groundPollution} cls="text-yellow" />}
      {b.noise > 0 && <KV k="Gürültü" v={b.noise} cls={b.noise > 30 ? 'text-yellow' : undefined} testId="building-noise" />}
      {b.commuteMinutes !== null && (
        <KV
          k="İşe ulaşım"
          v={Number.isFinite(b.commuteMinutes) ? `${b.commuteMinutes.toFixed(1)} dk` : 'Rota yok'}
          cls={!Number.isFinite(b.commuteMinutes) ? 'text-red' : b.commuteMinutes > 6 ? 'text-yellow' : 'text-green'}
          testId="building-commute"
        />
      )}
      {b.happiness !== null && <KV k="Mutluluk" v={`%${b.happiness}`} cls={b.happiness >= 50 ? 'text-green' : 'text-yellow'} />}
      <KV k="Yol erişimi" v={b.roadAccess ? 'Var' : 'Yok — terk edilecek'} cls={b.roadAccess ? 'text-green' : 'text-red'} />
      {b.pollution > 0 && <KV k="Kirlilik üretimi" v={b.pollution} />}
      {b.dailyTax !== null && b.state === 'active' && <KV k="Vergi" v={`${formatMoney(b.dailyTax)}/gün`} cls="text-green" testId="building-tax" />}
      <Utilities b={b} />
      {b.health !== null && <KV k="Sağlık" v={`%${b.health}`} cls={b.health >= 50 ? 'text-green' : 'text-yellow'} />}
      <KV k="Suç" v={b.crime} cls={b.crime > 35 ? 'text-red' : undefined} />
      <Coverage b={b} />
      {b.level < 3 && b.state === 'active' && (
        <div className="levelup">
          <div className="section-title">Seviye {b.level + 1} için</div>
          {b.levelBlockers.length === 0 ? <div className="notice ok">Gereksinimler karşılandı</div> : (
            <ul className="notice warn">{b.levelBlockers.map((x) => <li key={x}>{x}</li>)}</ul>
          )}
        </div>
      )}
    </>
  );
}

const yes = (v: boolean | null, label: string) =>
  v === null ? null : <KV k={label} v={v ? 'Var' : 'Yok'} cls={v ? 'text-green' : 'text-red'} testId={`util-${label}`} />;

function Utilities({ b }: { b: BuildingInfo }) {
  return (
    <>
      {yes(b.utilities.power, 'Elektrik')}
      {yes(b.utilities.water, 'Su')}
      {yes(b.utilities.sewage, 'Kanalizasyon')}
      {(b.utilities.power !== null || b.utilities.water !== null) && <KV k="Tüketim" v={`${b.electricity} kW · ${b.water} m³/gün`} />}
    </>
  );
}

const COVERAGE_ROWS: [keyof BuildingInfo['coverage'], string][] = [
  ['police', 'Polis'],
  ['fire', 'İtfaiye'],
  ['health', 'Sağlık'],
  ['education', 'İlkokul'],
  ['highEducation', 'Lise'],
  ['garbage', 'Çöp'],
];

function Coverage({ b }: { b: BuildingInfo }) {
  const rows = COVERAGE_ROWS.filter(([k]) => b.coverage[k] !== undefined);
  if (rows.length === 0) return null;
  return (
    <>
      <div className="section-title">Hizmet kapsamı</div>
      <div className="coverage-grid">
        {rows.map(([k, label]) => {
          const v = b.coverage[k] ?? 0;
          return (
            <div key={k} className="cov" title={`${label}: %${Math.round(v * 100)}`}>
              <span>{label}</span>
              <div className="bar"><span className={v >= 0.6 ? 'fill-green' : v >= 0.3 ? 'fill-yellow' : 'fill-red'} style={{ width: `${Math.max(3, v * 100)}%` }} /></div>
            </div>
          );
        })}
      </div>
    </>
  );
}

function BuildingDetails({ b }: { b: BuildingInfo }) {
  if (b.zone) return <GrowableDetails b={b} />;
  return (
    <>
      <KV k="Kategori" v={b.category} />
      <KV k="Alan" v={`${b.w}×${b.d} hücre`} />
      <KV k="Çalışan" v={formatNumber(b.workers)} />
      {b.infra.map((l) => (
        <KV key={l.label} k={l.label} v={l.value} cls={l.value.startsWith('Yok') ? 'text-red' : undefined} />
      ))}
      <Utilities b={b} />
      <KV k="Kirlilik" v={b.pollution === 0 ? 'Yok' : String(b.pollution)} />
      <KV k="Yol erişimi" v={b.roadAccess ? 'Var' : 'Yok'} cls={b.roadAccess ? 'text-green' : 'text-red'} />
      <KV k="İnşaat bedeli" v={formatMoney(b.cost)} />
      <KV k="Haftalık bakım" v={formatMoney(b.maintenance)} />
    </>
  );
}

function RoadPlanCard() {
  const plan = useGameStore((s) => s.roadPlan);
  const roadType = useGameStore((s) => s.roadType);
  const mode = useGameStore((s) => s.roadMode);
  const type = getRoadType(plan?.typeId ?? roadType);
  const hint =
    mode === 'straight'
      ? 'Başlangıç için tıklayın, bitiş için tekrar tıklayın ya da sürükleyip bırakın. Yol, bittiği yerden devam eder.'
      : mode === 'curve'
        ? 'Başlangıç → kontrol noktası → bitiş noktasına tıklayın.'
        : 'Dönüştürmek istediğiniz yolun üzerine gelip tıklayın.';
  return (
    <section className="panel inspector" data-testid="inspector-road">
      <div className="panel-header">
        <h3><Icon name="road" size={16} /> {type.name}</h3>
        <span className="chip">{mode === 'straight' ? 'Düz' : mode === 'curve' ? 'Kavisli' : 'Yenile'}</span>
      </div>
      <p className="muted small">{type.description}</p>
      <KV k="Genişlik / Şerit" v={`${type.width} m · ${type.lanes}${type.oneWay ? ' (tek yön)' : ''}`} />
      <KV k="Hız / Kapasite" v={`${type.speedKmh} km/s · ${formatNumber(type.capacity)}/sa`} />
      {plan ? (
        <>
          <div className="section-title">{plan.mode === 'upgrade' ? 'Yenileme' : 'Plan'}</div>
          {plan.mode === 'upgrade' && plan.fromTypeId && <KV k="Mevcut yol" v={getRoadType(plan.fromTypeId).name} />}
          <KV k="Uzunluk" v={formatMeters(plan.length)} testId="plan-length" />
          {plan.bridgeLength > 0 && <KV k="Köprü" v={formatMeters(plan.bridgeLength)} />}
          {plan.mode !== 'upgrade' && <KV k="En yüksek eğim" v={`%${(plan.maxGrade * 100).toFixed(0)}`} />}
          {plan.junctions > 0 && <KV k="Yeni kavşak" v={plan.junctions} />}
          {plan.refund !== undefined && <KV k="Eski yol iadesi" v={formatMoney(plan.refund)} />}
          <KV k={plan.mode === 'upgrade' ? 'Net maliyet' : 'İnşaat maliyeti'} v={formatMoney(plan.cost)} cls="text-blue" testId="plan-cost" />
          <KV k="Haftalık bakım" v={formatMoney(plan.weeklyMaintenance)} />
          <Errors valid={plan.valid} errors={plan.errors} okText="Geçerli — tıklayarak inşa edin" />
        </>
      ) : (
        <p className="hint">{hint}</p>
      )}
      <p className="hint">Ctrl: serbest çizim · Sağ tık / ESC: iptal</p>
    </section>
  );
}

function LinePlanCard({ kind }: { kind: 'power' | 'pipe' }) {
  const plan = useGameStore((s) => s.linePlan);
  const type = LINE_TYPES[kind];
  return (
    <section className="panel inspector" data-testid="inspector-line">
      <div className="panel-header">
        <h3><Icon name={kind === 'power' ? 'power' : 'water'} size={16} /> {type.name}</h3>
      </div>
      <p className="muted small">{type.description}</p>
      <KV k="Maliyet" v={`${formatMoney(type.costPerMeter)}/m`} />
      {plan ? (
        <>
          <KV k="Uzunluk" v={formatMeters(plan.length)} />
          <KV k="İnşaat" v={formatMoney(plan.cost)} cls="text-blue" />
          <KV k="Haftalık bakım" v={formatMoney(plan.weeklyMaintenance)} />
          {plan.valid && (plan.joins > 0 || plan.crossings > 0) && (
            <p className="hint text-green" data-testid="line-joins">
              {plan.joins > 0 ? `Mevcut hatta bağlanır (${plan.joins} uç)` : ''}
              {plan.joins > 0 && plan.crossings > 0 ? ' · ' : ''}
              {plan.crossings > 0 ? `${plan.crossings} hatla kesişip birleşir` : ''}
            </p>
          )}
          <Errors valid={plan.valid} errors={plan.errors} okText="Geçerli — tıklayarak döşeyin" />
        </>
      ) : (
        <p className="hint">Başlangıç ve bitiş noktasına tıklayın; hat bittiği yerden devam eder.</p>
      )}
      <p className="hint">{kind === 'pipe'
          ? 'Borular yeraltındadır; Su katmanında görünür. Mavi: su kaynağına bağlı, kırmızı: bağlı değil. Yeni boruyu mevcut bir borunun ucuna veya ortasına başlatıp bitirerek ağları birleştirin.'
          : 'Binalar birbirine elektrik iletir; hatlar ayrı bölgeleri bağlar. Yeni hattı mevcut bir hattın üzerinden başlatabilirsiniz.'} Sağ tık / ESC: bitir</p>
    </section>
  );
}

function BuildingPlanCard() {
  const plan = useGameStore((s) => s.buildingPlan);
  const type = useGameStore((s) => s.buildingType);
  const def = getBuilding(plan?.defId ?? type);
  return (
    <section className="panel inspector" data-testid="inspector-building-plan">
      <div className="panel-header">
        <h3><Icon name="building" size={16} /> {def.name}</h3>
        {def.unique && <span className="chip">Tek</span>}
      </div>
      <p className="muted small">{def.description}</p>
      <KV k="Alan" v={`${def.footprint[0]}×${def.footprint[1]} hücre`} />
      <KV k="Maliyet" v={formatMoney(def.cost)} cls="text-blue" />
      <KV k="Haftalık bakım" v={formatMoney(def.maintenance)} />
      <KV k="Çalışan" v={formatNumber(def.workers)} />
      {def.utility?.power && <KV k="Üretim" v={`${(def.utility.power / 1000).toFixed(1)} MW`} cls="text-yellow" />}
      {def.utility?.water && <KV k="Su üretimi" v={`${def.utility.water} m³/gün`} cls="text-blue" />}
      {def.utility?.sewage && <KV k="Atık su kapasitesi" v={`${def.utility.sewage} m³/gün`} />}
      {def.service && <KV k="Kapsama / kapasite" v={`${def.service.radius * 8} m · ${formatNumber(def.service.capacity)}`} />}
      {def.pollution > 0 && <KV k="Kirlilik" v={def.pollution} cls="text-yellow" />}
      {(def.utility?.water || def.utility?.sewage) && <p className="hint">Bir su borusuna en fazla 2 hücre uzaklıkta olmalı.</p>}
      {plan ? <Errors valid={plan.valid} errors={plan.errors} okText="Uygun konum — tıklayarak inşa edin" /> : <p className="hint">Binayı bir yolun kenarına yerleştirin.</p>}
      <p className="hint"><kbd>R</kbd> döndür · ön cephe yola bakmalı</p>
    </section>
  );
}

function DemolishCard() {
  const t = useGameStore((s) => s.demolishTarget);
  return (
    <section className="panel inspector" data-testid="inspector-demolish">
      <div className="panel-header">
        <h3><Icon name="demolish" size={16} /> Yıkım</h3>
      </div>
      {t ? (
        <>
          <KV k={t.kind === 'road' ? 'Yol' : 'Bina'} v={t.name} />
          <KV k="İade (%50)" v={formatMoney(t.refund)} cls="text-green" />
          <p className="hint">Yıkmak için tıklayın.</p>
        </>
      ) : (
        <p className="hint">Yıkmak istediğiniz yolun veya binanın üzerine gelin.</p>
      )}
    </section>
  );
}

export function InspectorPanel() {
  const tool = useGameStore((s) => s.tool);
  const selection = useGameStore((s) => s.selection);
  const hover = useGameStore((s) => s.hover);

  if (tool === 'road') return <RoadPlanCard />;
  if (tool === 'building' || tool === 'power' || tool === 'water' || tool === 'services') return <BuildingPlanCard />;
  if (tool === 'powerline' || tool === 'pipe') return <LinePlanCard kind={tool === 'powerline' ? 'power' : 'pipe'} />;
  if (tool === 'demolish') return <DemolishCard />;

  if (selection) {
    const title =
      selection.kind === 'cell' ? 'Seçili Arazi' : selection.kind === 'road' ? selection.road.name : selection.building.name;
    const icon = selection.kind === 'cell' ? 'target' : selection.kind === 'road' ? 'road' : 'building';
    return (
      <section className="panel inspector" data-testid={`inspector-${selection.kind}`}>
        <div className="panel-header">
          <h3><Icon name={icon} size={16} /> {title}</h3>
          <button className="icon-btn small" onClick={() => getGame()?.clearSelection()} title="Seçimi kaldır (ESC)">
            <Icon name="close" size={14} />
          </button>
        </div>
        {selection.kind === 'cell' && <CellDetails cell={selection.cell} zone={selection.zone} landValue={selection.landValue} pollution={selection.pollution} />}
        {selection.kind === 'road' && <RoadDetails road={selection.road} />}
        {selection.kind === 'building' && <BuildingDetails b={selection.building} />}
        <button className="btn secondary full" onClick={() => getGame()?.focusSelection()}>
          <Icon name="target" size={14} /> Kamerayı odakla <kbd>F</kbd>
        </button>
      </section>
    );
  }

  if (hover) {
    return (
      <section className="panel inspector compact" data-testid="inspector-hover">
        <KV k="Hücre" v={`${hover.i}, ${hover.j}`} cls="mono" />
        <KV k={TERRAIN_TYPE_LABEL[hover.type]} v={`${hover.height.toFixed(1)} m · %${(hover.slope * 100).toFixed(0)}`} />
        <p className="hint">Ayrıntılar için tıklayın</p>
      </section>
    );
  }
  return null;
}
