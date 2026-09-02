/**
 * Configuração central do site Remop Retífica.
 * Único lugar a editar quando o número de WhatsApp, o endpoint do bot
 * ou as credenciais públicas do Firebase mudarem.
 */
window.REMOP_CONFIG = {
  // TODO(cliente): confirmar o número real do WhatsApp antes de publicar em produção.
  whatsappNumero: "5515000000000",
  whatsappMensagemPadrao:
    "Olá! Vim pelo site da Remop e gostaria de solicitar um orçamento.",

  enderecoCompleto:
    "R. Av. 5 de Novembro, 1301 — Vila Nastri, Itapetininga - SP, 18207-320",

  // Endpoint do bot. Só responde quando o site estiver publicado no Netlify
  // com a Netlify Function configurada e ANTHROPIC_API_KEY definida.
  chatBotEndpoint: "/.netlify/functions/chat-bot",

  // Config pública do Firebase (SDK client-side). Não é segredo — a
  // segurança dos dados é garantida pelas regras do Firestore, não por
  // esconder estes valores. Preencher com o projeto real antes de usar
  // o formulário de agendamento em produção.
  firebase: {
    apiKey: "SUBSTITUIR_FIREBASE_API_KEY",
    authDomain: "SUBSTITUIR.firebaseapp.com",
    projectId: "SUBSTITUIR_PROJECT_ID",
    storageBucket: "SUBSTITUIR.appspot.com",
    messagingSenderId: "SUBSTITUIR_SENDER_ID",
    appId: "SUBSTITUIR_APP_ID",
  },
};
