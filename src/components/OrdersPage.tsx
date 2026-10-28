function OrdersPage() {
  return (
    <div className="page-view" id="orders-page">
      <section className="simple-page-header">
        <span className="section-kicker">CONSULTA</span>
        <h1>Consultar pedido</h1>
        <p>Informe o número do pedido ou o telefone usado no cadastro para acompanhar seu status.</p>
      </section>
      <section className="order-lookup-panel">
        <form id="order-lookup-form" className="order-lookup-form">
          <div className="lookup-fields">
            <label>Número do pedido<input id="lookup-order-id" type="text" placeholder="Ex.: 4A2F9C10" autoComplete="off" /></label>
            <label>Telefone cadastrado<input id="lookup-phone" type="tel" placeholder="(11) 99999-9999" inputMode="tel" autoComplete="tel" /></label>
          </div>
          <button type="submit" className="lookup-button">Consultar</button>
        </form>
        <p className="lookup-feedback" id="lookup-feedback" role="status" />
        <div className="order-tracking" id="order-tracking" />
      </section>
      <section className="orders-list" id="orders-list" />
    </div>
  )
}

export default OrdersPage
