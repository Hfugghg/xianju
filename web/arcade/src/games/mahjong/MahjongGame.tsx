import { type Tile } from './types';
import './styles.css';
const initialHand: Tile[] = [
  ...Array.from({ length: 3 }, (_, i) => ({ id: `w${i}`, suit: 'wan' as const, value: i + 1 })),
  ...Array.from({ length: 3 }, (_, i) => ({ id: `b${i}`, suit: 'bamboo' as const, value: i + 2 })),
  ...Array.from({ length: 3 }, (_, i) => ({ id: `c${i}`, suit: 'circle' as const, value: i + 5 })),
  ...Array.from({ length: 5 }, (_, i) => ({ id: `h${i}`, suit: 'honor' as const, value: [1, 1, 5, 6, 7][i] })),
];
export function TileFace({ tile }: { tile: Tile }) {
  return (
    <span className={`tile-face ${tile.suit}`} aria-hidden="true">
      {tile.suit === 'wan' ? (
        <>
          <strong>{['一', '二', '三', '四', '五', '六', '七', '八', '九'][tile.value - 1]}</strong>
          <small>萬</small>
        </>
      ) : tile.suit === 'honor' ? (
        <strong>{['東', '南', '西', '北', '中', '發', '□'][tile.value - 1]}</strong>
      ) : (
        <span className={`pips pips-${tile.value}`}>
          {Array.from({ length: tile.value }, (_, i) => (
            <i key={i} />
          ))}
        </span>
      )}
    </span>
  );
}
export function Wall({ side }: { side: string }) {
  return (
    <div className={`wall wall-${side}`} aria-hidden="true">
      {Array.from({ length: 17 }, (_, i) => (
        <span key={i} />
      ))}
    </div>
  );
}
export function MahjongPreview() {
  return (
    <div className="mini-table" aria-hidden="true">
      <div className="mini-outline" />
      <span className="mini-wind">東</span>
      <div className="mini-wall top">
        {Array.from({ length: 12 }, (_, i) => (
          <i key={i} />
        ))}
      </div>
      <div className="mini-wall right">
        {Array.from({ length: 9 }, (_, i) => (
          <i key={i} />
        ))}
      </div>
      <div className="mini-wall left">
        {Array.from({ length: 9 }, (_, i) => (
          <i key={i} />
        ))}
      </div>
      <div className="preview-hand">
        {initialHand.slice(0, 9).map((tile) => (
          <div className="preview-tile" key={tile.id}>
            <TileFace tile={tile} />
          </div>
        ))}
      </div>
      <span className="mini-dice">⚄</span>
    </div>
  );
}
