type SidebarProps = {
  admin?: boolean
}

function Sidebar({ admin = false }: SidebarProps) {
  return (
    <aside className="sidebar" aria-label="Menu de navegação">
      <div className="drawer-heading">
        <a className="brand" href={admin ? '/' : '#inicio'} data-page={admin ? undefined : 'home'} aria-label="Comandix início">
          <img className="brand-mark-icon" src="/img/icons/comandix_icone.svg" alt="" aria-hidden="true" />
          <span>Comandix</span>
        </a>
        <button className="drawer-close" id="close-menu" type="button" aria-label="Fechar menu">×</button>
      </div>
      <nav className="main-nav">
        {admin ? (
          <>
            <p className="nav-label">Gestão da loja</p>
            <nav className="admin-subnav" id="admin-subnav" aria-label="Seções administrativas" hidden>
              <button className="active" data-admin-section="dashboard">
                <img className="admin-subnav-icon" src="/img/icons/layout-fluido.svg" alt="" aria-hidden="true" />
                <span>Dashboard</span>
              </button>
              <button data-admin-section="orders">
                <img className="admin-subnav-icon" src="/img/icons/grafico-kanban.svg" alt="" aria-hidden="true" />
                <span>Kanban de pedidos</span>
              </button>
              <button data-admin-section="menu">
                <img className="admin-subnav-icon" src="/img/icons/alinhar-a-esquerda.svg" alt="" aria-hidden="true" />
                <span>Cardápio</span>
              </button>
            </nav>
            <a href="/" className="nav-item">
              <img className="nav-icon" src="/img/icons/casa.svg" alt="" aria-hidden="true" />
              <span>Voltar para a loja</span>
            </a>
          </>
        ) : (
          <>
            <p className="nav-label">Principal</p>
            <a href="#inicio" className="nav-item active" data-page="home">
              <img className="nav-icon" src="/img/icons/casa.svg" alt="" aria-hidden="true" />
              <span>Início</span>
            </a>
            <p className="nav-label">Pedidos</p>
            <a href="#pedidos" className="nav-item" data-page="orders">
              <img className="nav-icon" src="/img/icons/editar.svg" alt="" aria-hidden="true" />
              <span>Acompanhar pedido</span>
            </a>
            <a href="#carrinho" className="nav-item" data-page="cart">
              <img className="nav-icon" src="/img/icons/carrinho-de-compras.svg" alt="" aria-hidden="true" />
              <span>Meu carrinho</span>
            </a>
          </>
        )}
      </nav>
      <div className="sidebar-bottom">
        <a className="support-card" id="support-whatsapp" href="#" target="_blank" rel="noopener noreferrer">
          <span className="support-icon">?</span>
          <div><strong>Precisa de ajuda?</strong><span>Fale com a gente</span></div>
          <span className="support-arrow">↗</span>
        </a>
      </div>
    </aside>
  )
}

export default Sidebar
