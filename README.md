# Comandix

Aplicação de pedidos com catálogo, adicionais e checkout.

## Estrutura

- `front/`: interface, estilos, lógica do catálogo, carrinho e checkout.
- `front/components/`: espaço para componentes visuais reutilizáveis.
- `back/`: API Node.js/Express.
- `back/src/validators.js`: validação dos pedidos com Zod.
- `back/src/payments.js`: integração de checkout e validação de webhooks.
- `prisma/schema.prisma`: modelos PostgreSQL.
- `prisma/migrations/`: migrations versionadas.
- `img/`: imagens dos produtos.
- `.env`: configuração local, ignorada pelo Git.
- `.env.example`: modelo das variáveis necessárias.

Na execução local, configure `CLIENT_ORIGIN=http://localhost:5173` para corresponder à origem padrão do Vite. Para permitir o acesso administrativo apenas pela própria máquina, configure `ADMIN_ALLOWED_IPS=127.0.0.1,::1` (loopback IPv4 e IPv6).

Configure `STORE_LAT` e `STORE_LNG` com as coordenadas do estabelecimento para uma cotação de distância mais precisa. `STORE_CEP` pode ser usado como alternativa se o provedor de CEP retornar coordenadas. Em hospedagens como a Vercel, configure essas variáveis no ambiente de execução do projeto; o arquivo `.env` local não é enviado no deploy.

O cliente informa o CEP de entrega; rua, bairro, cidade e UF são preenchidos pela consulta de CEP. Número, tipo de residência e ponto de referência são coletados no checkout. A taxa é calculada no servidor pela distância aproximada em linha reta entre as coordenadas dos CEPs: até 5 km custa R$ 5, acima de 5 e até 10 km custa R$ 10, e acima de 10 km custa R$ 20. Antes da cotação, o checkout mostra “Consultar”.

## Executar

```bash
npm install
npm run db:generate
npm run db:deploy
npm start
```

Abra `http://localhost:3000`.

## Deploy na Vercel

Configure o projeto da Vercel com a raiz do repositório, Node.js 20 ou superior e as variáveis de ambiente de produção. O `npm run build` gera o Prisma Client e publica também as imagens de `img/`. As rotas `/api/admin/*` são reescritas para uma única função Vercel, que restaura o caminho original antes de encaminhar a requisição ao Express; as outras funções da pasta `api/` também encaminham suas rotas para o Express.

Cadastre na Vercel, sem adicionar segredos ao Git:

- `DATABASE_URL`, `DIRECT_URL` e `DATA_ENCRYPTION_KEY`; aplique as migrations no PostgreSQL antes do primeiro uso.
- `ADMIN_PASSWORD` (mínimo de 12 caracteres) ou `ADMIN_PASSWORD_HASH`.
- `PUBLIC_BASE_URL` com a URL HTTPS pública do site.
- `CLIENT_ORIGIN` com a mesma origem pública do site, por exemplo `https://loja.exemplo.com`.

Use a URL pública de cada ambiente em `PUBLIC_BASE_URL` e `CLIENT_ORIGIN`. O painel e a loja dependem do PostgreSQL configurado e acessível pela função. A Vercel usa instâncias serverless: sessões administrativas mantidas em memória e imagens novas gravadas no disco local não são persistentes entre instâncias/deploys. Para operar essas funções em produção, sessões e uploads precisam usar armazenamento compartilhado/persistente.

## Pagamento

O checkout oferece cartão de crédito, cartão de débito, Pix e dinheiro na entrega. Crédito, débito e Pix são apresentados como opções separadas e cada uma redireciona ao Checkout Pro do Mercado Pago, limitada ao meio selecionado. A API cria a preferência com preços recalculados pelo servidor; a confirmação do pagamento só é atualizada após um webhook assinado e uma consulta autenticada ao Mercado Pago. Os dados de cartão permanecem no provedor. Para dinheiro, o cliente pode informar o valor para troco, que precisa ser igual ou maior que o total.

Para ativar pagamentos, configure na Vercel ou no `.env` local:

- `PAYMENT_PROVIDER=mercadopago`.
- `MERCADOPAGO_ACCESS_TOKEN` com o Access Token de teste para homologação e de produção para cobrar clientes reais.
- `MERCADOPAGO_WEBHOOK_SECRET` com a chave secreta de assinatura de notificações Webhooks do Mercado Pago.
- `PUBLIC_BASE_URL` com a URL HTTPS pública do site em produção.

No painel do Mercado Pago, cadastre `https://<domínio-do-site>/api/payments/mercadopago/webhook` como URL de Webhooks e habilite notificações de pagamentos. Faça um pedido de teste para cada opção; confira o status pelo pedido e pelo webhook antes de substituir as credenciais de teste pelas de produção. Com `PAYMENT_PROVIDER=mock`, o sistema não inicia cobranças online. Nunca coloque Access Token ou chave de webhook no frontend nem no Git.

## Proteções aplicadas

- Helmet para headers HTTP de segurança.
- CORS limitado a `CLIENT_ORIGIN`.
- Rate limit de 120 requisições por 15 minutos.
- Limite de JSON em 20 KB.
- Validação de corpo, método de pagamento, produtos e adicionais.
- Preços recalculados pelo catálogo do servidor, sem confiar no frontend.
- `.env` ignorado para não publicar segredos.
- Nenhum dado de cartão é persistido.

## Administração

O usuário administrativo é `admin` (`ADMIN_USER` no `.env`). Configure `ADMIN_PASSWORD` no mesmo arquivo com pelo menos 12 caracteres para liberar o acesso; a senha não possui valor padrão. A área permite dashboard diário, semanal, mensal e anual de pedidos e faturamento, cadastro e edição de colaboradores, programação de férias separada do cadastro, registro de ponto e anexos PDF/JPG/PNG de até 5 MB.

No Dashboard, o ADM filtra pedidos, faturamento ou ambos por período. Colaboradores e Cardápio têm atalhos próprios na sidebar. Na aba Cardápio, o ADM pode criar, renomear e excluir grupos, além de editar produtos, alterar imagem, descrição, categoria e preço, ocultar/exibir itens sem excluí-los e cadastrar promoções percentuais com início e fim opcionais. Em **Grupos**, marque “Mostrar na tela inicial” para exibir uma categoria na vitrine; grupos ocultos continuam disponíveis para configurar escolhas de combos. Para isso, cadastre os produtos candidatos em um grupo, edite o combo e selecione esse grupo em “Grupo de opções do combo”. Marque individualmente quais produtos poderão ser escolhidos no combo e defina o limite de 1 a 4 opções diferentes. Assim, se o grupo tiver seis produtos, é possível disponibilizar só cinco. As escolhas são incluídas no preço do combo e aparecem no carrinho, no pedido e nas notificações. Para evitar excluir produtos por acidente, um grupo só pode ser apagado quando estiver sem produtos e não estiver vinculado a combos; os grupos reservados para adicionais não podem ser renomeados nem excluídos. A lista mostra promoções ativas, agendadas e encerradas, com ações para editar ou apagar. A prévia mostra o preço final; a vitrine exibe o selo “Promoção” e o backend aplica o desconto apenas durante o período programado. Os dados operacionais ficam no PostgreSQL, e informações pessoais são cifradas pela aplicação.

CPF, salário, endereço, dados do cliente e documentos são cifrados com AES-256-GCM pela aplicação antes de serem salvos no PostgreSQL. Configure uma chave aleatória de 32 bytes em Base64 como `DATA_ENCRYPTION_KEY`; mantenha-a em segredo e faça backup seguro.

## Supabase e migrações

Crie um projeto Supabase chamado `Comandix` e copie `.env.example` para `.env`. No painel do Supabase, abra **Connect** e use as URLs do pooler: configure `DATABASE_URL` com o pooler de transação (porta 6543) e `DIRECT_URL` com o pooler de sessão (porta 5432). Substitua os placeholders pelo host, referência do projeto e senha fornecidos pelo Supabase; codifique caracteres especiais da senha como URL encoding.

Gere uma chave de dados com `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"` e configure o resultado em `DATA_ENCRYPTION_KEY`. Troque também `ADMIN_PASSWORD` por uma senha forte. As URLs do Supabase devem apontar para o banco `postgres`; `Comandix` é o nome do projeto Supabase.

Execute `npm run db:generate` e `npm run db:deploy` para gerar o Prisma Client e aplicar as migrations; `npm run db:migrate` cria/aplica migrations em desenvolvimento. Para importar registros do antigo `back/data/admin-store.enc`, configure a senha que cifrou esse arquivo em `ADMIN_PASSWORD` e execute `npm run db:import-legacy` após aplicar as migrations. A importação é transacional e mantém o arquivo legado sem alterações; confirme os registros no banco antes de arquivar a cópia antiga.

Configure `STORE_WHATSAPP` com o telefone da loja em formato internacional apenas com números, por exemplo `5511999999999`, para habilitar o atalho direto ao WhatsApp.

Para enviar atualizações automáticas ao cliente diretamente pela WhatsApp Cloud API, configure `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID` (o ID do número, não o telefone) e os nomes dos templates em `WHATSAPP_TEMPLATE_*`. O token é usado somente pelo backend e deve permanecer no `.env`, nunca no frontend ou no repositório. Crie e aprove quatro templates na plataforma WhatsApp Business/Meta, em português (`pt_BR`); mantenha os corpos e a ordem exata dos parâmetros:
- `pedido_confirmado`: `✅ Pedido confirmado! Nº {{1}} · Feito em {{2}} · Cliente: {{3}} · Telefone: {{4}} · Entrega em: {{5}} · Itens: {{6}} · Subtotal: {{7}} · Entrega: {{8}} · Total: {{9}} · Pagamento: {{10}} · Previsão: {{11}}`
- `pedido_em_producao`: `👨‍🍳 Seu pedido #{{1}} está sendo preparado com carinho. Em breve estará pronto. Previsão: {{2}}`
- `pedido_em_rota`: `🛵 Seu pedido #{{1}} está a caminho. Previsão: {{2}}. Prepare-se para receber!`
- `pedido_entregue`: `🎉 Seu pedido #{{1}} foi entregue com sucesso! Obrigado pela preferência. Esperamos você novamente em breve!`

O cliente só recebe mensagens se marcar a opção de consentimento no checkout. A confirmação de pedidos em dinheiro é enviada ao criar o pedido; para Mercado Pago, ela só é enviada após aprovação do pagamento. Os estados em produção, em rota e entregue são enviados quando alterados no painel; pedido pronto não gera mensagem. `WHATSAPP_DELIVERY_ESTIMATE` define o prazo mostrado (padrão `60 min`). Sem as credenciais ou templates configurados, o pedido e as mudanças de status continuam funcionando, mas nenhuma mensagem é enviada.
Sistema de pedidos com loja, carrinho, acompanhamento e painel administrativo. A interface usa React, TypeScript e Vite; o servidor Express e a integração com PostgreSQL/Prisma permanecem em `back/` e `prisma/`.

## Requisitos

- Node.js 20 ou superior
- PostgreSQL configurado para a aplicação

## Desenvolvimento

1. Instale as dependências com `npm install`.
2. Copie `.env.example` para `.env`, substitua os placeholders da conexão PostgreSQL e defina uma senha administrativa forte.
   - Para usar o PostgreSQL do Supabase, no painel do projeto abra **Connect** e use a URI do pooler de transações (porta `6543`) em `DATABASE_URL`, com `pgbouncer=true`, `connection_limit=1` e `sslmode=require`. Para `DIRECT_URL`, prefira a URI do pooler de sessão (porta `5432`), necessária para migrations quando a conexão direta do projeto não estiver acessível na rede.
   - A aplicação usa Prisma para acessar o PostgreSQL. `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` e `SUPABASE_SECRET_KEY` não substituem essas URIs e não são necessárias para essa integração. Não coloque uma chave `secret` no frontend nem a envie ao repositório.
3. Gere uma chave de criptografia com `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"` e atribua o resultado a `DATA_ENCRYPTION_KEY`. Mantenha essa chave salva e estável; trocá-la impede a leitura dos dados já criptografados.
4. Gere o cliente do banco com `npm run db:generate` e aplique as migrations com `npm run db:migrate`.
5. Inicie o servidor da API com `npm run server`.
6. Em outro terminal, inicie o React com `npm run dev`.

O Vite encaminha as chamadas `/api` ao servidor local em `http://localhost:3000`.

## Build e produção

- `npm run build` compila e valida o frontend, gerando os arquivos em `dist/`.
- `npm start` inicia o servidor Express, que serve a aplicação compilada e os endpoints da API.
- `npm run db:deploy` aplica as migrations em produção.
- `npm test` executa os testes do backend.
- `npm run lint` executa o Oxlint.

## Estrutura

- `src/components/`: componentes React da navegação, páginas e diálogos.
- `src/legacy/`: comportamento existente da loja e do painel, ainda baseado nos identificadores do DOM.
- `front/`: folhas de estilo da interface.
- `back/`: API Express, autenticação, pedidos, pagamentos e integrações.
- `prisma/`: schema e migrations do banco.
- `img/`: ícones e imagens dos produtos.
- `comandix_landing_page/`: página de apresentação independente.
