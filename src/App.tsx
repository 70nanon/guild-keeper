import './App.css'

function App() {
  return (
    <div className="app-shell">
      <header className="site-header">
        <span className="brand">GK <span aria-hidden="true">✦</span></span>
        <span className="status">開発中</span>
      </header>
      <main>
        <section className="game-screen" aria-labelledby="game-title">
          <div className="crest" aria-hidden="true">✦</div>
          <p className="eyebrow">ここから、ギルドの物語がはじまる</p>
          <h1 id="game-title">Guild Keeper</h1>
          <p className="description">冒険を支える、あなたの場所。</p>
          <div className="notice">
            <h2>ただいま準備中</h2>
            <p>ギルドの扉が開く日をお待ちください。</p>
          </div>
        </section>
      </main>
      <footer>Guild Keeper · Development Preview</footer>
    </div>
  )
}

export default App
