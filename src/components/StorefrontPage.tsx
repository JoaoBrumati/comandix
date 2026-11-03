function StorefrontPage() {
  return (
    <div className="page-view active" id="home-page">
      <section className="content-section">
        <a className="store-hero store-hero-banner" href="#catalog" aria-label="Faça seu pedido de salgados Fino Sabor">
          <img src="/img/fino-sabor-banner.png" alt="Fino Sabor Salgados: uma mistura de sabores e temperos deliciosos. Faça seu pedido." />
        </a>

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
