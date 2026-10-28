type FooterProps = {
  admin?: boolean
}

function Footer({ admin = false }: FooterProps) {
  return (
    <footer className="site-footer">
      <a className="footer-brand" href={admin ? '/' : '#inicio'} data-page={admin ? undefined : 'home'}>Comandix</a>
      <span>{admin ? 'Painel administrativo.' : 'Seu pedido, do seu jeito.'}</span>
    </footer>
  )
}

export default Footer
