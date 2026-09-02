/**
 * Configuração central do site Remop Retífica.
 * Único lugar a editar quando o número de WhatsApp, o endpoint do bot
 * ou as credenciais públicas do Supabase mudarem.
 */
window.REMOP_CONFIG = {
  // Número encontrado via busca (SoluTudo + diretórios de empresas,
  // confirmado em mais de uma fonte). CONFIRME com o cliente antes de
  // divulgar em produção — diretório de terceiros pode estar desatualizado.
  whatsappNumero: "5515996954644",
  telefoneFixo: "(15) 3271-8838",
  whatsappMensagemPadrao:
    "Olá! Vim pelo site da Remop e gostaria de solicitar um orçamento.",

  enderecoCompleto:
    "Av. 5 de Novembro, 1301 — Vila Nastri, Itapetininga - SP, 18207-320",

  // Endpoint do bot. Só responde quando o site estiver publicado no Netlify
  // com a Netlify Function configurada e ANTHROPIC_API_KEY definida.
  chatBotEndpoint: "/.netlify/functions/chat-bot",

  // Config pública do Supabase (SDK client-side). Não é segredo — a
  // "anon key" é feita pra ficar exposta no navegador; a segurança dos
  // dados é garantida pelas políticas de RLS (Row Level Security) do
  // banco, não por esconder estes valores. Preencher com o projeto real
  // antes de usar o formulário de agendamento em produção (ver README).
  supabase: {
    url: "SUBSTITUIR_SUPABASE_URL",
    anonKey: "SUBSTITUIR_SUPABASE_ANON_KEY",
  },
};
