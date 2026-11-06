type FooterProps = {
  admin?: boolean
}

function Footer({ admin = false }: FooterProps) {
  return (
    <footer className="site-footer">
      <a className="footer-brand" href={admin ? '/' : '#inicio'} data-page={admin ? undefined : 'home'}>Comandix</a>
    </footer>
  )
}

export default Footer
