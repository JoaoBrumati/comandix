const navigationItems = [
  { page: 'home', hash: 'inicio', label: 'Loja', icon: 'casa.svg' },
  { page: 'orders', hash: 'pedidos', label: 'Pedidos', icon: 'editar.svg' },
  { page: 'cart', hash: 'carrinho', label: 'Carrinho', icon: 'carrinho-de-compras.svg' },
  { page: 'admin', hash: 'admin', label: 'Gestão', icon: 'administrador.svg' },
]

function MobileNavigation() {
  return (
    <nav className="mobile-tabbar" aria-label="Navegação principal">
      {navigationItems.map(({ page, hash, label, icon }) => (
        <a
          key={page}
          className={`mobile-tab${page === 'home' ? ' active' : ''}`}
          href={`#${hash}`}
          data-page={page}
          aria-current={page === 'home' ? 'page' : undefined}
        >
          <span className="mobile-tab-icon">
            <img src={`/img/icons/${icon}`} alt="" aria-hidden="true" />
            {page === 'cart' && <span className="nav-count mobile-nav-count" aria-label="0 itens no carrinho">0</span>}
          </span>
          <span>{label}</span>
        </a>
      ))}
    </nav>
  )
}

export default MobileNavigation
