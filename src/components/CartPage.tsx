function CartPage() {
  return (
    <div className="page-view" id="cart-page">
      <section className="simple-page-header">
        <span className="section-kicker">SEU PEDIDO</span>
        <h1>Meu carrinho</h1>
        <p>Revise os itens e finalize quando estiver tudo certo.</p>
      </section>
      <div className="cart-layout">
        <section className="cart-items" id="cart-items" />
        <aside className="checkout-card" id="checkout-card" />
      </div>
    </div>
  )
}

export default CartPage
