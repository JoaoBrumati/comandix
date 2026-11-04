function CheckoutDialog() {
  return (
    <div className="payment-overlay" id="payment-overlay" aria-hidden="true">
      <section className="payment-dialog" role="dialog" aria-modal="true" aria-labelledby="payment-title">
        <button className="detail-close" id="payment-close" aria-label="Fechar pagamento">×</button>
        <div className="payment-content">
          <span className="section-kicker" id="checkout-step-label">ETAPA 1 DE 2 · ENTREGA</span>
          <h2 id="payment-title">Seus dados de entrega</h2>
          <p className="payment-intro" id="checkout-step-intro">Preencha seus dados para receber o pedido.</p>
          <section className="checkout-step active" id="delivery-step" aria-label="Dados de entrega">
            <div className="checkout-contact-grid">
              <label>Nome completo<input id="customer-name" autoComplete="name" placeholder="Seu nome e sobrenome" required /></label>
              <label>Telefone<input id="customer-phone" type="tel" autoComplete="tel" inputMode="tel" placeholder="(11) 99999-9999" required /></label>
            </div>
            <label className="whatsapp-opt-in"><input id="whatsapp-opt-in" type="checkbox" /> Quero receber atualizações deste pedido pelo WhatsApp.</label>
            <div className="delivery-address-block">
              <div className="address-block-heading"><strong>Endereço de entrega</strong><span>Informe o CEP para localizar o endereço.</span></div>
              <div className="cep-field">
                <label htmlFor="delivery-cep">CEP</label>
                <div><input id="delivery-cep" autoComplete="postal-code" inputMode="numeric" maxLength={9} placeholder="00000-000" required /><button id="lookup-cep" type="button">Buscar CEP</button></div>
              </div>
              <p className="address-feedback" id="address-feedback" role="status" />
              <div className="address-fields">
                <label>Endereço<input id="delivery-street" autoComplete="address-line1" placeholder="Preenchido pelo CEP" readOnly /></label>
                <div className="address-two-columns">
                  <label>Número<input id="delivery-number" inputMode="numeric" autoComplete="address-line2" placeholder="Nº da casa" required /></label>
                  <label>Bairro<input id="delivery-neighborhood" placeholder="Preenchido pelo CEP" readOnly /></label>
                </div>
                <div className="address-two-columns">
                  <label>Cidade<input id="delivery-city" placeholder="Preenchido pelo CEP" readOnly /></label>
                  <label>UF<input id="delivery-state" placeholder="UF" readOnly /></label>
                </div>
                <fieldset className="residence-choice">
                  <legend>Tipo de residência</legend>
                  <label><input type="radio" name="residence-type" value="Casa" defaultChecked /><span>Casa</span></label>
                  <label><input type="radio" name="residence-type" value="Apartamento" /><span>Apartamento</span></label>
                </fieldset>
                <label>Complemento (opcional)<input id="delivery-complement" autoComplete="address-line2" placeholder="Bloco, apartamento, andar" /></label>
                <label>Ponto de referência (opcional)<input id="delivery-reference" placeholder="Ex.: portão azul, perto da praça" /></label>
              </div>
            </div>
            <div className="delivery-breakdown">
              <div><span>Taxa de entrega</span><strong id="delivery-fee-value">Consultar</strong></div>
              <div><span>Distância aproximada</span><strong id="delivery-distance-value">Consultar</strong></div>
              <div><span>Subtotal dos itens</span><strong id="delivery-subtotal-value">R$ 0,00</strong></div>
              <div className="delivery-total"><span>Total com entrega</span><strong id="delivery-total-value">Consultar</strong></div>
            </div>
            <button className="confirm-payment" id="calculate-delivery">Consultar taxa de entrega <span>⌕</span></button>
            <button className="confirm-payment" id="continue-payment">Continuar pagamento <span>→</span></button>
          </section>
          <section className="checkout-step" id="payment-step" aria-label="Forma de pagamento">
            <button className="back-to-delivery" id="back-to-delivery">← Voltar para entrega</button>
            <div className="payment-methods" id="payment-methods">
              <button className="payment-method active" data-method="credit_card" aria-pressed="true"><span className="payment-method-icon">▣</span><strong>Crédito</strong><small>Checkout seguro Mercado Pago</small></button>
              <button className="payment-method" data-method="debit_card" aria-pressed="false"><span className="payment-method-icon">▣</span><strong>Débito</strong><small>Checkout seguro Mercado Pago</small></button>
              <button className="payment-method" data-method="pix" aria-pressed="false"><span className="payment-method-icon">◇</span><strong>Pix</strong><small>Pagamento pelo Mercado Pago</small></button>
              <button className="payment-method" data-method="cash" aria-pressed="false"><span className="payment-method-icon">◇</span><strong>Dinheiro</strong><small>Pagar na entrega</small></button>
            </div>
            <div className="payment-panel active" data-panel="credit_card"><div className="pix-box"><span>MERCADO PAGO</span><strong>Cartão de crédito</strong><small>Você informará os dados do cartão no ambiente seguro do Mercado Pago.</small></div></div>
            <div className="payment-panel" data-panel="debit_card"><div className="pix-box"><span>MERCADO PAGO</span><strong>Cartão de débito</strong><small>Você informará os dados do cartão no ambiente seguro do Mercado Pago.</small></div></div>
            <div className="payment-panel" data-panel="pix"><div className="pix-box"><span>MERCADO PAGO</span><strong>Pix</strong><small>O QR Code e o código Pix serão gerados no ambiente seguro do Mercado Pago.</small></div></div>
            <div className="payment-panel" data-panel="cash"><label>Troco para (opcional)<input id="cash-change" type="number" min="0.01" step="0.01" inputMode="decimal" placeholder="Ex.: 50,00" /></label><small className="secure-note">Informe um valor igual ou maior que o total apenas se precisar de troco.</small></div>
            <div className="payment-summary">
              <div><span>Itens</span><strong id="payment-subtotal">R$ 0,00</strong></div>
              <div><span>Taxa de entrega</span><strong id="payment-delivery-fee">Consultar</strong></div>
              <div className="payment-grand-total"><span>Total do pedido</span><strong id="payment-total">Consultar</strong></div>
            </div>
            <button className="confirm-payment" id="confirm-payment">Ir para pagamento seguro <span>→</span></button>
          </section>
          <p className="payment-error" id="payment-error" role="alert" />
        </div>
      </section>
    </div>
  )
}

export default CheckoutDialog
