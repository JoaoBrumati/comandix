function StorefrontPage() {
  return (
    <div className="page-view active" id="home-page">
      <section className="content-section">
        <section className="store-hero">
          <div className="store-hero-copy">
            <span className="hero-eyebrow"><span className="hero-status-dot" /> SABOR EM CADA PEDIDO</span>
            <h1>Seu próximo pedido, do seu jeito.</h1>
            <p>Escolha com calma, personalize do seu jeito e receba uma refeição preparada na hora.</p>
            <div className="hero-actions">
              <a className="hero-primary-action" href="#catalog">Explorar cardápio <span aria-hidden="true">↗</span></a>
            </div>
          </div>
          <div className="store-hero-art" aria-hidden="true">
            <img src="/img/menu/0482f8b3-033b-49dd-8ae0-59101eaf9130.webp" alt="" />
            <div className="hero-art-caption"><span>UMA BOA ESCOLHA</span><strong>Sabor que conquista.</strong></div>
          </div>
        </section>

        <section className="catalog-section" id="catalog">
          <div className="catalog-heading">
            <div>
              <span className="section-kicker">FEITO PARA VOCÊ</span>
              <h2 className="menu-title">Explore nosso cardápio</h2>
              <p>Encontre algo gostoso para hoje.</p>
            </div>
            <label className="search">
              <span aria-hidden="true">⌕</span>
              <input id="search-input" type="search" placeholder="Buscar no cardápio..." aria-label="Buscar no cardápio" />
            </label>
          </div>
          <div className="menu-toolbar">
            <div className="category-row" id="category-row" />
            <div className="food-layout-toggle" role="group" aria-label="Layout dos alimentos">
              <button className="layout-option active" type="button" data-food-layout="square" aria-pressed="true">Grade</button>
              <button className="layout-option" type="button" data-food-layout="rectangle" aria-pressed="false">Lista</button>
            </div>
          </div>
          <section className="daily-promotion" id="daily-promotion" hidden />
          <div className="food-grid" id="food-grid" />
        </section>
      </section>
    </div>
  )
}

export default StorefrontPage
