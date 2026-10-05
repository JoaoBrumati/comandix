# anota.ai

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

Configure `STORE_CEP` no `.env` com o CEP do estabelecimento antes de ativar a cotação. Opcionalmente, use `STORE_LAT` e `STORE_LNG` para informar coordenadas mais precisas.

O cliente informa o CEP de entrega; rua, bairro, cidade e UF são preenchidos pela consulta de CEP. Número, tipo de residência e ponto de referência são coletados no checkout. A taxa é calculada no servidor pela distância aproximada em linha reta entre as coordenadas dos CEPs: até 5 km custa R$ 5, acima de 5 e até 10 km custa R$ 10, e acima de 10 km custa R$ 20. Antes da cotação, o checkout mostra “Consultar”.

## Executar

```bash
npm install
npm run db:generate
npm run db:deploy
npm start
```

Abra `http://localhost:3000`.

## Pagamento

O checkout oferece dinheiro na entrega ou redireciona cartão/PIX ao Checkout Pro do Mercado Pago. A API cria a preferência com preços recalculados pelo servidor; a confirmação do pagamento só é atualizada após um webhook assinado e uma consulta autenticada ao Mercado Pago. Os dados de cartão permanecem no provedor.

Para testar cobrança, configure `PAYMENT_PROVIDER=mercadopago`, `MERCADOPAGO_ACCESS_TOKEN`, `MERCADOPAGO_WEBHOOK_SECRET` e `PUBLIC_BASE_URL`. Em produção, `PUBLIC_BASE_URL` precisa ser HTTPS e apontar para o domínio público que recebe `/api/payments/mercadopago/webhook`. Use credenciais de teste antes das credenciais de produção e confirme os eventos de pagamento no painel do Mercado Pago. Com `PAYMENT_PROVIDER=mock`, o sistema não inicia cobranças online.

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

No Dashboard, o ADM filtra pedidos, faturamento ou ambos por período. Colaboradores e Cardápio têm atalhos próprios na sidebar. Na aba Cardápio, o ADM pode criar e editar grupos e produtos, alterar imagem, descrição, categoria e preço, ocultar/exibir itens sem excluí-los e cadastrar promoções percentuais com início e fim opcionais. Grupos com produtos vinculados ou reservados para adicionais não podem ser apagados. A lista mostra promoções ativas, agendadas e encerradas, com ações para editar ou apagar. A prévia mostra o preço final; a vitrine exibe o selo “Promoção” e o backend aplica o desconto apenas durante o período programado. Os dados operacionais ficam no PostgreSQL, e informações pessoais são cifradas pela aplicação.

CPF, salário, endereço, dados do cliente e documentos são cifrados com AES-256-GCM pela aplicação antes de serem salvos no PostgreSQL. Configure uma chave aleatória de 32 bytes em Base64 como `DATA_ENCRYPTION_KEY`; mantenha-a em segredo e faça backup seguro.

## PostgreSQL e migração

Copie `.env.example` para `.env` e configure `DATABASE_URL` com a conexão PostgreSQL. Gere uma chave de dados com `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"` e configure o resultado em `DATA_ENCRYPTION_KEY`.

`npm run db:generate` gera o Prisma Client. `npm run db:deploy` aplica as migrations versionadas; em desenvolvimento, `npm run db:migrate` cria/aplica migrations. Para importar registros do antigo `back/data/admin-store.enc`, configure a senha que cifrou esse arquivo em `ADMIN_PASSWORD` e execute `npm run db:import-legacy` depois de aplicar a migration. A importação usa Prisma, é transacional e mantém o arquivo legado sem alterações; confirme os registros no banco antes de arquivar a cópia antiga.

Configure `STORE_WHATSAPP` com o telefone da loja em formato internacional apenas com números, por exemplo `5511999999999`, para habilitar o atalho direto ao WhatsApp.
