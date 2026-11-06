function AdminPage() {
  return (
    <div className="page-view active" id="admin-page">
      <section className="admin-login-view" id="admin-login-view">
        <span className="section-kicker">ÁREA RESTRITA</span>
        <h1>Administração</h1>
        <p>Entre com seu usuário e senha. Depois, confirme o acesso pelo Microsoft Authenticator.</p>
        <form id="admin-login-form">
          <label>Usuário<input id="admin-username" autoComplete="username" defaultValue="admin" required /></label>
          <label>Senha do administrador<input id="admin-password" type="password" autoComplete="current-password" required /></label>
          <button type="submit">Entrar no painel <span>→</span></button>
          <button className="admin-text-button" id="forgot-password-link" type="button">Esqueci a minha senha</button>
        </form>
        <p className="admin-feedback" id="admin-login-feedback" role="alert" />
        <form id="admin-forgot-password-form" hidden>
          <p>Informe o e-mail cadastrado para receber um link seguro de redefinição.</p>
          <label>E-mail<input id="admin-forgot-password-email" type="email" autoComplete="email" maxLength={254} required /></label>
          <button type="submit">Enviar link de recuperação</button>
          <button className="admin-secondary" id="forgot-password-back" type="button">Voltar ao login</button>
          <p className="admin-feedback" id="forgot-password-feedback" role="status" />
        </form>
        <form id="admin-reset-password-form" hidden>
          <p>Escolha uma nova senha com pelo menos 12 caracteres.</p>
          <input id="admin-reset-password-token" type="hidden" />
          <label>Nova senha<input id="admin-reset-password" type="password" autoComplete="new-password" minLength={12} maxLength={128} required /></label>
          <label>Confirme a nova senha<input id="admin-reset-password-confirm" type="password" autoComplete="new-password" minLength={12} maxLength={128} required /></label>
          <button type="submit">Redefinir senha</button>
          <button className="admin-secondary" id="reset-password-back" type="button">Voltar ao login</button>
          <p className="admin-feedback" id="reset-password-feedback" role="alert" />
        </form>
        <form id="admin-totp-setup-form" hidden>
          <p id="admin-totp-setup-description">Escaneie o QR code no Microsoft Authenticator e informe o código de seis dígitos exibido.</p>
          <img id="admin-totp-qr" alt="QR code para configurar o Microsoft Authenticator" />
          <p>Se não puder escanear, informe esta chave no aplicativo:</p>
          <code id="admin-totp-secret" />
          <label>Código do aplicativo<input id="admin-totp-setup-code" type="text" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} required /></label>
          <button type="submit">Ativar e acessar <span>→</span></button>
          <button className="admin-secondary" id="admin-totp-setup-back" type="button">Voltar</button>
          <p className="admin-feedback" id="admin-totp-setup-feedback" role="alert" />
        </form>
        <form id="admin-totp-code-form" hidden>
          <p>Informe o código de seis dígitos do Microsoft Authenticator. Você também pode usar um código de recuperação.</p>
          <label>Código de segurança<input id="admin-totp-code" type="text" inputMode="text" autoComplete="one-time-code" maxLength={19} required /></label>
          <button type="submit">Confirmar e acessar <span>→</span></button>
          <button className="admin-secondary" id="admin-totp-code-back" type="button">Voltar</button>
          <p className="admin-feedback" id="admin-totp-code-feedback" role="alert" />
        </form>
        <section id="admin-recovery-codes" hidden>
          <h2>Guarde seus códigos de recuperação</h2>
          <p>Use cada código uma única vez caso não consiga acessar o autenticador. Eles não serão exibidos novamente.</p>
          <ol id="admin-recovery-code-list" />
          <button className="admin-primary" id="admin-recovery-continue" type="button">Guardei os códigos e continuar</button>
        </section>
      </section>

      <section className="admin-dashboard-view" id="admin-dashboard-view" hidden>
        <div className="admin-page-heading">
          <div>
            <span className="section-kicker">GESTÃO DA LOJA</span>
            <h1>Administração</h1>
          </div>
          <div className="admin-dashboard-actions">
            <button id="admin-logout" className="admin-logout">Sair</button>
          </div>
        </div>
        <section className="admin-panel active" id="admin-dashboard-panel">
          <div className="dashboard-report-heading">
            <div>
              <span className="section-kicker">RELATÓRIOS</span>
              <h2>Relatórios de pedidos</h2>
              <p>Resumo de vendas, pedidos e produtos do período selecionado.</p>
            </div>
            <div className="admin-dashboard-actions">
              <button id="dashboard-export" className="admin-secondary" type="button">Exportar planilha</button>
              <button id="dashboard-print" className="admin-primary" type="button">Imprimir</button>
            </div>
          </div>
          <div className="dashboard-controls">
            <div className="admin-periods" aria-label="Período do dashboard">
              <button className="active" data-period="daily">Hoje</button>
              <button data-period="weekly">Esta semana</button>
              <button data-period="monthly">Este mês</button>
              <button data-period="yearly">Este ano</button>
            </div>
            <label>Exibir<select id="dashboard-filter"><option value="all">Todos</option><option value="orders">Pedidos</option><option value="revenue">Faturamento</option></select></label>
          </div>
          <div className="admin-metrics" id="admin-metrics" />
          <div className="dashboard-analytics-grid">
            <section className="dashboard-card dashboard-revenue-card" data-dashboard-group="revenue">
              <div className="dashboard-card-heading">
                <div><h2>Faturamento dos pedidos recentes</h2><p>Distribuição temporal dos pedidos listados</p></div>
              </div>
              <div id="dashboard-revenue-chart" className="dashboard-revenue-chart" />
            </section>
            <section className="dashboard-card dashboard-status-card" data-dashboard-group="orders">
              <div className="dashboard-card-heading">
                <div><h2>Pedidos por status</h2><p id="dashboard-status-caption">Distribuição dos pedidos recentes</p></div>
              </div>
              <div id="dashboard-status-chart" className="dashboard-status-chart" />
            </section>
            <section className="dashboard-card dashboard-products-card" data-dashboard-group="orders">
              <div className="dashboard-card-heading">
                <div><h2>Produtos mais pedidos</h2><p>Itens com maior quantidade nos pedidos listados</p></div>
              </div>
              <div id="dashboard-top-products" className="dashboard-top-products" />
            </section>
            <section className="dashboard-card dashboard-recent-card" data-dashboard-group="orders">
              <div className="dashboard-card-heading">
                <div><h2>Pedidos recentes</h2><p>Últimos pedidos incluídos no relatório</p></div>
              </div>
              <div id="admin-orders-summary" className="orders-summary" />
            </section>
          </div>
          <section className="admin-data-section" id="admin-orders-section">
            <div className="security-log-panel" id="admin-security-log" />
          </section>
        </section>

        <section className="admin-panel" id="admin-orders-panel">
          <div className="admin-section-heading">
            <div>
              <span className="section-kicker">FLUXO DA COZINHA</span>
              <h2>Kanban de pedidos</h2>
              <p>Acompanhe cada pedido e atualize a etapa conforme ele avança.</p>
            </div>
          </div>
          <div className="kanban-controls">
            <div className="admin-periods" aria-label="Período do Kanban">
              <button className="active" data-kanban-period="daily">Diário</button>
              <button data-kanban-period="weekly">Semanal</button>
              <button data-kanban-period="monthly">Mensal</button>
              <button data-kanban-period="yearly">Anual</button>
            </div>
            <button className="admin-secondary" id="refresh-kanban">Atualizar</button>
          </div>
          <div className="orders-kanban" id="orders-kanban" />
        </section>

        <section className="admin-panel" id="admin-menu-panel">
          <div className="admin-section-heading">
            <div>
              <span className="section-kicker">PRODUTOS E ADICIONAIS</span>
              <h2>Configurações do cardápio</h2>
              <p>Organize produtos, categorias e promoções exibidos na loja.</p>
            </div>
            <div className="menu-heading-actions">
              <button className="admin-secondary" id="manage-groups-button" type="button">Grupos</button>
              <button className="admin-primary" id="new-product-button" type="button">+ Novo produto</button>
            </div>
          </div>
          <section className="group-manager" id="group-manager" hidden>
            <form id="group-form">
              <label>Novo grupo<input id="group-name" maxLength={50} required placeholder="Ex.: Lanches" /></label>
              <button className="admin-primary" type="submit">Adicionar grupo</button>
            </form>
            <p className="group-manager-help">Desmarque para ocultar a categoria da tela inicial. Grupos ocultos também podem ser usados como opções de combos.</p>
            <div id="group-list" className="group-list" />
          </section>
          <section className="promotion-manager">
            <div className="admin-section-heading">
              <div><span className="section-kicker">VITRINE</span><h2>Promoções ativas e agendadas</h2></div>
              <button className="admin-primary" id="add-promotion-button">+ Nova promoção</button>
            </div>
            <div className="promotion-list" id="promotion-list" />
            <form className="promotion-form" id="promotion-form" hidden>
              <input id="promotion-id" type="hidden" />
              <label>Produto<select id="promotion-product" required><option value="">Selecione um produto</option></select></label>
              <label>Desconto (%)<input id="promotion-percent" type="number" min="1" max="90" step="1" placeholder="Ex.: 15" required /></label>
              <label>Começa em<input id="promotion-start" type="datetime-local" /></label>
              <label>Termina em<input id="promotion-end" type="datetime-local" /></label>
              <div className="promotion-preview" id="promotion-preview">Selecione produto e porcentagem</div>
              <div className="promotion-form-actions">
                <button className="admin-secondary" id="cancel-promotion" type="button">Cancelar</button>
                <button className="admin-primary" type="submit">Salvar promoção</button>
              </div>
            </form>
          </section>
          <form className="employee-form menu-form" id="menu-form" hidden>
            <input id="menu-product-id" type="hidden" />
            <input id="menu-product-active" type="hidden" defaultValue="true" />
            <label>Nome<input id="menu-product-name" required /></label>
            <label>Grupo<select id="menu-product-category" required><option value="">Selecione um grupo</option></select></label>
            <label>Preço (R$)<input id="menu-product-price" type="number" min="0" step="0.01" required /></label>
            <label>Grupo de opções do combo<select id="menu-product-option-group"><option value="">Não usa escolhas adicionais</option></select></label>
            <label>Máximo de opções diferentes<input id="menu-product-max-options" type="number" min="1" max="4" step="1" defaultValue="4" /></label>
            <fieldset className="combo-option-products" id="combo-option-products" hidden>
              <legend>Produtos disponíveis para o cliente</legend>
              <p>Marque somente os produtos que poderão ser escolhidos neste combo.</p>
              <div id="combo-option-product-list" />
            </fieldset>
            <label>Imagem do produto<input id="menu-product-image" type="file" accept="image/jpeg,image/png,image/webp" /></label>
            <div className="menu-image-preview" id="menu-image-preview" hidden>
              <img alt="Foto atual do produto" />
              <button type="button" className="admin-secondary" id="remove-product-image">Remover foto</button>
            </div>
            <label className="menu-description-field">Descrição<textarea id="menu-product-description" rows={3} required /></label>
            <div className="employee-form-actions">
              <button type="button" className="admin-secondary" id="cancel-product">Cancelar</button>
              <button type="submit" className="admin-primary">Salvar produto</button>
            </div>
          </form>
          <div className="menu-product-list" id="menu-product-list" />
        </section>
        <section className="admin-panel" id="admin-profile-panel">
          <div className="admin-section-heading">
            <div>
              <span className="section-kicker">ACESSO ADMINISTRATIVO</span>
              <h2>Perfil</h2>
              <p>Consulte seus dados e gerencie o acesso dos colaboradores.</p>
            </div>
          </div>
          <section className="admin-profile-card" id="admin-profile-details" aria-live="polite" />
          <form className="admin-self-account-form" id="admin-self-account-form">
            <div>
              <h3>Editar meu acesso</h3>
              <p>Confirme sua senha atual para alterar o nome de usuário ou a senha.</p>
            </div>
            <label>Nome de usuário<input id="admin-self-account-name" name="name" autoComplete="username" minLength={2} maxLength={100} required /></label>
            <label>Senha atual<input id="admin-self-account-current-password" type="password" autoComplete="current-password" required /></label>
            <label>Nova senha (opcional)<input id="admin-self-account-password" type="password" autoComplete="new-password" minLength={12} maxLength={128} /><small>Deixe em branco para manter a senha atual.</small></label>
            <label>Confirme a nova senha<input id="admin-self-account-confirm-password" type="password" autoComplete="new-password" minLength={12} maxLength={128} /></label>
            <button className="admin-primary" type="submit">Salvar alterações</button>
            <p className="admin-feedback" id="admin-self-account-feedback" role="alert" />
          </form>
          <section className="admin-account-management" id="admin-account-management">
            <div className="admin-section-heading">
              <div><h2>Cadastrar colaborador</h2><p>O colaborador entrará usando o nome ou e-mail e a senha cadastrada.</p></div>
            </div>
            <form className="admin-account-form" id="admin-account-form">
              <label>Nome do perfil<input id="admin-account-name" name="name" autoComplete="off" minLength={2} maxLength={100} required /></label>
              <label>E-mail<input id="admin-account-email" name="email" type="email" autoComplete="email" maxLength={254} required /></label>
              <label>Senha de acesso<input id="admin-account-password" name="password" type="password" autoComplete="new-password" minLength={12} maxLength={128} required /><small>Use pelo menos 12 caracteres.</small></label>
              <fieldset className="admin-account-permissions">
                <legend>Permissões de acesso</legend>
                <label><input type="checkbox" name="permission" value="dashboard" /> Dashboard</label>
                <label><input type="checkbox" name="permission" value="orders" /> Kanban</label>
                <label><input type="checkbox" name="permission" value="menu" /> Cardápio</label>
              </fieldset>
              <button className="admin-primary" type="submit">Cadastrar colaborador</button>
            </form>
            <div className="admin-account-list" id="admin-account-list" />
            <form className="admin-self-account-form admin-edit-account-form" id="admin-edit-account-form" hidden>
              <div>
                <h3>Editar colaborador</h3>
                <p>Altere o nome de usuário ou defina uma nova senha para este acesso.</p>
              </div>
              <input id="admin-edit-account-id" type="hidden" />
              <label>Nome de usuário<input id="admin-edit-account-name" name="name" autoComplete="off" minLength={2} maxLength={100} required /></label>
              <label>Nova senha (opcional)<input id="admin-edit-account-password" type="password" autoComplete="new-password" minLength={12} maxLength={128} /></label>
              <label>Confirme a nova senha<input id="admin-edit-account-confirm-password" type="password" autoComplete="new-password" minLength={12} maxLength={128} /></label>
              <div className="employee-form-actions">
                <button className="admin-secondary" id="admin-edit-account-cancel" type="button">Cancelar</button>
                <button className="admin-primary" type="submit">Salvar alterações</button>
              </div>
              <p className="admin-feedback" id="admin-edit-account-feedback" role="alert" />
            </form>
          </section>
        </section>
      </section>
    </div>
  )
}

export default AdminPage
