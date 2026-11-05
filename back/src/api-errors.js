function getApiErrorResponse(error) {
  if (error?.type === 'entity.parse.failed') {
    return { status: 400, body: { error: 'JSON inválido.' } };
  }
  if (error?.code === 'P2021' || error?.code === 'P2022') {
    return {
      status: 503,
      body: { error: 'A estrutura do banco deste ambiente está desatualizada. Aplique as migrations na base DATABASE_URL configurada para este ambiente da Vercel.' }
    };
  }
  return { status: 500, body: { error: 'Erro interno do servidor.' } };
}

module.exports = { getApiErrorResponse };
