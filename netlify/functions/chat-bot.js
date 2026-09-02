/**
 * Netlify Function — bot de atendimento da Remop Retífica.
 *
 * Isola a chamada real à API da Anthropic no backend: o frontend nunca
 * vê a chave. Só roda quando publicado no Netlify com a variável de
 * ambiente ANTHROPIC_API_KEY configurada — em GitHub Pages esta function
 * simplesmente não existe, e o widget do frontend já trata isso com um
 * fallback pro WhatsApp (ver assets/js/chat-widget.js).
 */

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_MODEL = "claude-haiku-4-5-20251001";
const MAX_MENSAGENS_HISTORICO = 12;
const MAX_CARACTERES_MENSAGEM = 1000;

const SYSTEM_PROMPT = `Você é o assistente virtual da Remop Retífica de Motores e Auto Peças, em Itapetininga-SP, no ar desde 1987.

Seu papel:
- Ajudar o visitante a entender qual serviço ele provavelmente precisa (retífica de cabeçote, bielas, cilindro, virabrequim, recuperação de bloco, usinagem de motores, troca de correia dentada).
- Explicar de forma simples o que cada serviço faz, sem termos técnicos excessivos.
- Coletar, de forma natural na conversa, nome, telefone/WhatsApp e um resumo do problema do veículo — para o atendente humano já ter contexto.
- Transmitir o diferencial real da empresa: oficina de várias gerações, atendimento próximo, prioridade em orientar antes de vender.

Regras que você NUNCA quebra:
- Nunca informa preço, orçamento fechado ou prazo exato. Todo valor é "a consultar" com a equipe.
- Nunca confirma agendamento sozinho. Você pode sugerir um horário, mas quem confirma é o atendente humano.
- Sempre termina a conversa direcionando o cliente para o atendimento humano no WhatsApp, principalmente quando o assunto for orçamento, agendamento ou um problema técnico complexo.
- Se não souber responder algo com segurança, diga isso e encaminhe para o atendente humano — nunca invente informação técnica sobre o veículo do cliente.
- Respostas curtas (2 a 4 frases), tom cordial e direto, em português do Brasil.`;

function resposta(statusCode, corpo) {
  return {
    statusCode: statusCode,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(corpo),
  };
}

function normalizarHistorico(historico) {
  if (!Array.isArray(historico)) return [];

  return historico.slice(-MAX_MENSAGENS_HISTORICO).map(function (item) {
    return {
      role: item.papel === "bot" ? "assistant" : "user",
      content: String(item.texto || "").slice(0, MAX_CARACTERES_MENSAGEM),
    };
  });
}

exports.handler = async function (event) {
  if (event.httpMethod !== "POST") {
    return resposta(405, { erro: "Método não permitido." });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return resposta(500, {
      erro: "Bot ainda não configurado neste ambiente (ANTHROPIC_API_KEY ausente).",
    });
  }

  let corpo;
  try {
    corpo = JSON.parse(event.body || "{}");
  } catch (erro) {
    return resposta(400, { erro: "Corpo da requisição inválido." });
  }

  const mensagemUsuario = String(corpo.mensagem || "").trim().slice(0, MAX_CARACTERES_MENSAGEM);
  if (!mensagemUsuario) {
    return resposta(400, { erro: "Mensagem vazia." });
  }

  const mensagens = normalizarHistorico(corpo.historico).concat([
    { role: "user", content: mensagemUsuario },
  ]);

  try {
    const respostaAnthropic = await fetch(ANTHROPIC_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: ANTHROPIC_MODEL,
        max_tokens: 400,
        system: SYSTEM_PROMPT,
        messages: mensagens,
      }),
    });

    if (!respostaAnthropic.ok) {
      const detalhe = await respostaAnthropic.text();
      console.error("[chat-bot] Erro da API Anthropic:", respostaAnthropic.status, detalhe);
      return resposta(502, { erro: "Não foi possível falar com o assistente agora." });
    }

    const dados = await respostaAnthropic.json();
    const textoResposta = (dados.content || [])
      .filter(function (bloco) { return bloco.type === "text"; })
      .map(function (bloco) { return bloco.text; })
      .join("\n")
      .trim();

    return resposta(200, {
      resposta: textoResposta || "Desculpa, não consegui responder agora. Pode falar direto com nossa equipe no WhatsApp?",
    });
  } catch (erro) {
    console.error("[chat-bot] Falha inesperada:", erro);
    return resposta(500, { erro: "Erro interno ao processar a mensagem." });
  }
};
