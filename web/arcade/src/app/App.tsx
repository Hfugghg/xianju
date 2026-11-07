import { Suspense, useState } from 'react';
import { Button, Modal } from '@mantine/core';
import { games } from './registry';

export function App() {
  const [active, setActive] = useState<string | null>(null);
  const [about, setAbout] = useState(false);
  const game = games.find((g) => g.id === active);
  return (
    <div className="app-shell">
      <header className="site-header">
        <a
          className="brand"
          href="#"
          onClick={(e) => {
            e.preventDefault();
            setActive(null);
          }}
          aria-label="闲局首页"
        >
          <span className="brand-seal">闲</span>
          <span>闲局</span>
        </a>
        <nav aria-label="主导航">
          <button className={!game ? 'nav-link current' : 'nav-link'} onClick={() => setActive(null)}>
            游戏大厅
          </button>
          <button className="nav-link" onClick={() => setAbout(true)}>
            关于
          </button>
        </nav>
      </header>
      {game ? (
        <Suspense
          fallback={
            <main className="game-page" role="status">
              正在加载牌桌…
            </main>
          }
        >
          <game.Component onBack={() => setActive(null)} />
        </Suspense>
      ) : (
        <main className="lobby">
          <section className="game-section" aria-labelledby="games-heading">
            <div className="section-heading">
              <h1 id="games-heading">游戏大厅</h1>
            </div>
            {games.map((g) => (
              <article className="featured-game" key={g.id}>
                <div className="game-visual">
                  <g.Preview />
                </div>
                <div className="game-card-body">
                  <div>
                    <h2>{g.title}</h2>
                    <p>{g.description}</p>
                    <div className="game-tags">
                      <span>{g.players}</span>
                      <span>自动对战 / 逐步观战</span>
                    </div>
                  </div>
                  <Button
                    size="md"
                    className="enter-button"
                    data-testid="enter-mahjong"
                    onClick={() => setActive(g.id)}
                  >
                    进入牌桌
                  </Button>
                </div>
              </article>
            ))}
            <div className="coming-soon">
              <span>
                <b>將</b> 中国象棋
              </span>
              <span>
                <b>●</b> 五子棋
              </span>
              <small>待开发</small>
            </div>
          </section>
        </main>
      )}
      <footer className="site-footer">
        <span>闲局</span>
      </footer>
      <Modal opened={about} onClose={() => setAbout(false)} title="关于闲局" centered>
        <div className="about-copy">
          <p>浏览器棋牌室，对局与设置保存在本机。</p>
          <p>国标麻将：136 张无花牌，8 番起和。AI 使用 kdens3，优先 WebGPU，可回退 WASM。</p>
          <Button onClick={() => setAbout(false)}>关闭</Button>
        </div>
      </Modal>
    </div>
  );
}
