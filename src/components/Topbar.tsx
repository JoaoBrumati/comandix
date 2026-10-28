type TopbarProps = {
  admin?: boolean
}

function Topbar({ admin = false }: TopbarProps) {
  return (
    <>
      <header className="topbar compact-topbar">
        <button className="mobile-menu" id="mobile-menu" type="button" aria-label="Abrir menu" aria-expanded="false">
          <span aria-hidden="true">☰</span>
        </button>
        <span className="topbar-context">Comandix <span aria-hidden="true">›</span> {admin ? 'Administração' : 'Loja'}</span>
        <a className="brand compact-brand" href={admin ? '/' : '#inicio'} data-page={admin ? undefined : 'home'} aria-label="Comandix início">
          <img className="brand-mark-icon" src="/img/icons/comandix_icone.svg" alt="" aria-hidden="true" />
          <span>Comandix</span>
        </a>
        {!admin && (
          <div className="topbar-actions">
            <button className="topbar-icon-button" id="header-search" type="button" aria-label="Buscar no cardápio">
              <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.8" cy="10.8" r="6.8" /><path d="m16 16 4.5 4.5" /></svg>
            </button>
            <a className="topbar-icon-button topbar-cart" href="#carrinho" data-page="cart" aria-label="Abrir carrinho">
              <img src="/img/icons/carrinho-de-compras.svg" alt="" aria-hidden="true" />
              <span className="nav-count" id="nav-count">0</span>
            </a>
          </div>
        )}
      </header>
    </>
  )
}

export default Topbar
