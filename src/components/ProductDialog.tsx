function ProductDialog() {
  return (
    <div className="product-overlay" id="product-overlay" aria-hidden="true">
      <section className="product-detail" role="dialog" aria-modal="true" aria-labelledby="detail-name">
        <button className="detail-close" id="detail-close" aria-label="Fechar detalhes">×</button>
        <div className="detail-image-wrap"><img id="detail-image" alt="" /></div>
        <div className="detail-content">
          <span className="food-tag" id="detail-tag" />
          <h2 id="detail-name" />
          <p id="detail-description" />
          <strong className="detail-price" id="detail-price" />
          <div className="option-group">
            <div className="option-heading"><strong>Bebidas</strong></div>
            <div className="option-list" id="drink-options" />
          </div>
          <div className="option-group">
            <div className="option-heading"><strong>Acompanhamentos</strong></div>
            <div className="option-list" id="side-options" />
          </div>
          <div className="option-group">
            <div className="option-heading"><strong>Molhos</strong></div>
            <div className="option-list" id="sauce-options" />
          </div>
          <div className="detail-footer">
            <div className="detail-quantity">
              <button id="detail-decrease" aria-label="Diminuir quantidade">−</button>
              <span id="detail-quantity">1</span>
              <button id="detail-increase" aria-label="Aumentar quantidade">+</button>
            </div>
            <button className="detail-add" id="detail-add">Adicionar <span id="detail-total" /></button>
          </div>
        </div>
      </section>
    </div>
  )
}

export default ProductDialog
