import { useEffect, useState } from 'react'
import Sidebar from './components/Sidebar'
import Topbar from './components/Topbar'
import StorefrontPage from './components/StorefrontPage'
import OrdersPage from './components/OrdersPage'
import CartPage from './components/CartPage'
import AdminPage from './components/AdminPage'
import ProductDialog from './components/ProductDialog'
import CheckoutDialog from './components/CheckoutDialog'
import Footer from './components/Footer'
import MobileNavigation from './components/MobileNavigation'
import '../front/styles.css'
import '../front/food-layout.css'
import '../front/search.css'
import '../front/checkout.css'
import '../front/admin.css'
import './styles.css'

function App() {
  const [startupError, setStartupError] = useState('')
  const isAdminRoute = ['/login', '/admin'].includes(window.location.pathname.replace(/\/+$/, '') || '/')

  useEffect(() => {
    let active = true

    const pageScript = isAdminRoute
      ? import('./legacy/admin.js')
      : import('./legacy/storefront.js')

    pageScript.catch((error: unknown) => {
      console.error('Não foi possível iniciar os recursos da página.', error)
      if (active) {
        setStartupError(`Não foi possível carregar ${isAdminRoute ? 'a área administrativa' : 'a loja'}. Atualize a página para tentar novamente.`)
      }
    })

    return () => {
      active = false
    }
  }, [isAdminRoute])

  useEffect(() => {
    if (!isAdminRoute) return

    const sidebar = document.querySelector('.sidebar')
    const mobileMenu = document.querySelector('#mobile-menu')
    const drawerBackdrop = document.querySelector('#drawer-backdrop')
    const closeMenu = document.querySelector('#close-menu')
    if (!sidebar || !mobileMenu || !drawerBackdrop || !closeMenu) return

    const setDrawerOpen = (open: boolean) => {
      sidebar.classList.toggle('open', open)
      drawerBackdrop.classList.toggle('open', open)
      mobileMenu.setAttribute('aria-expanded', String(open))
    }
    const toggleDrawer = () => setDrawerOpen(!sidebar.classList.contains('open'))
    const closeDrawer = () => setDrawerOpen(false)

    mobileMenu.addEventListener('click', toggleDrawer)
    drawerBackdrop.addEventListener('click', closeDrawer)
    closeMenu.addEventListener('click', closeDrawer)
    return () => {
      mobileMenu.removeEventListener('click', toggleDrawer)
      drawerBackdrop.removeEventListener('click', closeDrawer)
      closeMenu.removeEventListener('click', closeDrawer)
    }
  }, [isAdminRoute])

  return (
    <div className="app-shell">
      <Sidebar admin={isAdminRoute} />
      <button className="drawer-backdrop" id="drawer-backdrop" type="button" aria-label="Fechar menu" tabIndex={-1} />
      <main className="main-content">
        <Topbar admin={isAdminRoute} />
        {startupError && <p className="startup-error" role="alert">{startupError}</p>}
        {isAdminRoute ? (
          <AdminPage />
        ) : (
          <>
            <StorefrontPage />
            <OrdersPage />
            <CartPage />
            <ProductDialog />
            <CheckoutDialog />
          </>
        )}
        <Footer admin={isAdminRoute} />
      </main>
      {!isAdminRoute && <MobileNavigation />}
      <div className="toast" id="toast" role="status" />
    </div>
  )
}

export default App
