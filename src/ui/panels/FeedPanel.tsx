import { useState } from 'react';
import type { FeedPost, PostKind } from '../../game/systems/CitizenFeed';
import { getGame } from '../../store/gameBridge';
import { useGameStore } from '../../store/gameStore';
import { formatGameDate } from '../../utils/format';
import { Icon } from '../components/Icon';

const KIND_LABEL: Record<PostKind, string> = { complaint: 'Şikâyet', request: 'İstek', praise: 'Teşekkür', news: 'Haber' };
const FILTERS: { id: PostKind | 'all'; name: string }[] = [
  { id: 'all', name: 'Hepsi' },
  { id: 'complaint', name: 'Şikâyet' },
  { id: 'request', name: 'İstek' },
  { id: 'praise', name: 'Teşekkür' },
  { id: 'news', name: 'Haber' },
];

const initials = (name: string) =>
  name
    .split(' ')
    .map((w) => w[0])
    .join('')
    .slice(0, 2);

function Post({ p }: { p: FeedPost }) {
  const when = formatGameDate(p.minute);
  return (
    <li className={`feed-post kind-${p.kind}`} data-testid="feed-post" data-topic={p.topic}>
      <div className="feed-avatar" style={{ background: p.color }} aria-hidden>
        {initials(p.author)}
      </div>
      <div className="feed-body">
        <div className="feed-head">
          <span className="feed-author">{p.author}</span>
          <span className="feed-handle">{p.handle}</span>
          <span className="feed-time">· {when.date} {when.time}</span>
        </div>
        <p className="feed-text">{p.text}</p>
        <div className="feed-foot">
          <span className={`feed-kind kind-${p.kind}`}>{KIND_LABEL[p.kind]}</span>
          {p.affected && <span className="feed-affected" title="Şehrin gerçek verisi">{p.affected}</span>}
          {p.focus && (
            <button className="feed-show" onClick={() => getGame()?.focusPoint(p.focus!.x, p.focus!.z)} data-testid="feed-show">
              <Icon name="search" size={12} /> Göster
            </button>
          )}
        </div>
      </div>
    </li>
  );
}

/** Kent Sesi: what citizens say about the city — written from the city's real state. */
export function FeedPanel() {
  const open = useGameStore((s) => s.popup === 'feed');
  const posts = useGameStore((s) => s.feed);
  const set = useGameStore((s) => s.set);
  const [filter, setFilter] = useState<PostKind | 'all'>('all');
  if (!open) return null;
  const shown = filter === 'all' ? posts : posts.filter((p) => p.kind === filter);
  return (
    <div className="panel popover feed-panel" data-testid="feed-panel">
      <div className="panel-header">
        <h3>
          <Icon name="chat" size={16} /> Kent Sesi
        </h3>
        <span className="muted small">{posts.length} gönderi</span>
        <button className="icon-btn small" onClick={() => set({ popup: null })} title="Kapat">
          <Icon name="close" size={14} />
        </button>
      </div>
      <div className="mode-group row feed-filters" role="tablist">
        {FILTERS.map((f) => (
          <button key={f.id} role="tab" aria-selected={filter === f.id} className={`mode-btn ${filter === f.id ? 'active' : ''}`} onClick={() => setFilter(f.id)} data-testid={`feed-filter-${f.id}`}>
            {f.name}
          </button>
        ))}
      </div>
      {shown.length === 0 ? (
        <p className="hint" data-testid="feed-empty">
          {posts.length === 0 ? 'Henüz kimse bir şey yazmadı. Vatandaşlar elektrik, su, trafik, iş ve hizmetler hakkında yazdıklarını burada paylaşır.' : 'Bu türde gönderi yok.'}
        </p>
      ) : (
        <ul className="feed-list">
          {shown.map((p) => (
            <Post key={p.id} p={p} />
          ))}
        </ul>
      )}
    </div>
  );
}
