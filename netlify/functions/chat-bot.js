/**
 * Netlify Function — bot de diagnóstico da Remop Retífica.
 *
 * Isola a chamada real à API da Anthropic no backend: o frontend nunca
 * vê a chave. Só roda quando publicado no Netlify com a variável de
 * ambiente ANTHROPIC_API_KEY configurada — em GitHub Pages esta function
 * simplesmente não existe, e o widget do frontend já trata isso com um
 * fallback pro WhatsApp (ver assets/js/chat-widget.js).
 *
 * Protocolo: o bot conduz um passo a passo de diagnóstico (não é um chat
 * livre) e sinaliza o que está fazendo com uma tag no início da resposta:
 *   [PERGUNTA]     — próxima pergunta objetiva sobre o carro
 *   [PESQUISANDO]  — avisa que vai pesquisar na internet antes de responder
 *   [DIAGNOSTICO]  — fecha com uma suspeita + "RESUMO_WHATSAPP:" pro handoff
 * Sem tag = segue a conversa normalmente (ex.: resposta a uma pergunta do
 * cliente no meio do processo).
 *
 * "Pesquisar de verdade" é sempre uma segunda chamada: a primeira (modo
 * "normal") só pode anunciar a intenção com [PESQUISANDO], sem ferramenta
 * disponível; o frontend então chama de novo com modo "pesquisar", que
 * habilita a ferramenta de busca — assim o cliente vê o aviso antes da
 * pesquisa acontecer de verdade.
 */

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_MODEL = "claude-haiku-4-5";
const MAX_MENSAGENS_HISTORICO = 12;
const MAX_CARACTERES_MENSAGEM = 1000;

const SYSTEM_PROMPT = `Você é o assistente de diagnóstico da Remop Retífica de Motores e Auto Peças, em Itapetininga-SP, no ar desde 1987.

Você NÃO é um chat de bate-papo livre. Você conduz um passo a passo de diagnóstico, uma pergunta objetiva de cada vez, até formar uma suspeita do que pode estar acontecendo com o motor/carro do visitante. Regras de condução:

1. Se ainda não sabe o que está acontecendo com o carro, faça UMA pergunta objetiva por vez (ex.: que barulho o carro está fazendo, quando começou, se acende alguma luz no painel, qual a quilometragem). Comece a resposta com a tag [PERGUNTA] antes do texto.
2. Se, pra responder bem, você precisar de uma informação que não tem certeza (sintoma específico, peça, comportamento de um modelo de carro) e realmente valeria pesquisar na internet: NÃO invente e NÃO pesquise ainda nesta resposta. Responda só com a tag [PESQUISANDO] seguida de uma frase curta avisando o cliente o que você vai pesquisar. Exemplo: "[PESQUISANDO] Vou pesquisar os sintomas comuns de coxim de motor gasto pra te dar uma resposta mais precisa." Você só vai poder pesquisar de verdade na próxima resposta.
3. Quando já tiver informação suficiente (sintomas relatados, contexto do carro) pra formar uma suspeita — mesmo que preliminar, isso não é um laudo técnico —, feche o passo a passo com a tag [DIAGNOSTICO] seguida de uma explicação simples e cordial da sua suspeita pro cliente. Na linha seguinte, sempre inclua "RESUMO_WHATSAPP:" com um resumo curto e objetivo (carro, sintomas relatados e a suspeita) — esse resumo, e só ele, é o que vai pro WhatsApp da equipe, então não repita a conversa inteira, só o essencial.
4. Se o cliente já se identificou (nome/WhatsApp/carro no contexto abaixo), não peça esses dados de novo.

Regras que você NUNCA quebra:
- Nunca informa preço, orçamento fechado ou prazo exato. Todo valor é "a consultar" com a equipe.
- Nunca confirma agendamento sozinho. Você pode indicar que a equipe vai confirmar, mas quem confirma é o atendente humano.
- Se não souber responder algo com segurança mesmo depois de pesquisar, diga isso e direcione pro atendente humano — nunca invente informação técnica sobre o veículo do cliente.
- Só use a tag [PESQUISANDO] quando for genuinamente pesquisar na resposta seguinte — nunca finja estar pesquisando.
- Respostas curtas (2 a 4 frases), tom cordial e direto, em português do Brasil, no máximo UMA pergunta por vez.`;

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

function contextoIdentidade(identidade) {
  if (!identidade || !identidade.nome) return "";

  var partes = ["nome = " + identidade.nome];
  if (identidade.whatsapp) partes.push("whatsapp = " + identidade.whatsapp);
  if (identidade.carro) partes.push("carro = " + identidade.carro);

  return "\n\nDados que o visitante já informou (não peça de novo): " + partes.join(", ") + ".";
}

/**
 * Extrai a tag do início da resposta e separa o resumo pra WhatsApp,
 * quando houver, deixando o texto limpo pra exibir pro cliente.
 */
function analisarResposta(textoBruto) {
  var texto = textoBruto.trim();
  var fase = "conversa";
  var resumoWhatsapp = null;

  var tags = ["[PESQUISANDO]", "[DIAGNOSTICO]", "[PERGUNTA]"];
  var tagEncontrada = tags.filter(function (tag) {
    return texto.indexOf(tag) === 0;
  })[0];

  if (tagEncontrada === "[PESQUISANDO]") {
    fase = "pesquisando";
    texto = texto.slice(tagEncontrada.length).trim();
  } else if (tagEncontrada === "[PERGUNTA]") {
    fase = "pergunta";
    texto = texto.slice(tagEncontrada.length).trim();
  } else if (tagEncontrada === "[DIAGNOSTICO]") {
    fase = "diagnostico";
    texto = texto.slice(tagEncontrada.length).trim();

    var marcador = texto.indexOf("RESUMO_WHATSAPP:");
    if (marcador !== -1) {
      resumoWhatsapp = texto.slice(marcador + "RESUMO_WHATSAPP:".length).trim();
      texto = texto.slice(0, marcador).trim();
    }
  }

  return { texto: texto, fase: fase, resumoWhatsapp: resumoWhatsapp };
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

  const modo = corpo.modo === "pesquisar" ? "pesquisar" : "normal";
  const mensagemUsuario = String(corpo.mensagem || "").trim().slice(0, MAX_CARACTERES_MENSAGEM);

  if (modo === "normal" && !mensagemUsuario) {
    return resposta(400, { erro: "Mensagem vazia." });
  }

  const mensagens = normalizarHistorico(corpo.historico);
  mensagens.push({
    role: "user",
    content:
      modo === "pesquisar"
        ? "(Pode pesquisar agora e me responder com o que encontrou.)"
        : mensagemUsuario,
  });

  const corpoRequisicao = {
    model: ANTHROPIC_MODEL,
    max_tokens: 600,
    system: SYSTEM_PROMPT + contextoIdentidade(corpo.identidade),
    messages: mensagens,
  };

  if (modo === "pesquisar") {
    corpoRequisicao.tools = [
      { type: "web_search_20250305", name: "web_search", max_uses: 2 },
    ];
  }

  try {
    const respostaAnthropic = await fetch(ANTHROPIC_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify(corpoRequisicao),
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

    if (!textoResposta) {
      return resposta(200, {
        resposta: "Desculpa, não consegui responder agora. Pode falar direto com nossa equipe no WhatsApp?",
        fase: "conversa",
        resumoWhatsapp: null,
      });
    }

    const analisada = analisarResposta(textoResposta);
    return resposta(200, {
      resposta: analisada.texto,
      fase: analisada.fase,
      resumoWhatsapp: analisada.resumoWhatsapp,
    });
  } catch (erro) {
    console.error("[chat-bot] Falha inesperada:", erro);
    return resposta(500, { erro: "Erro interno ao processar a mensagem." });
  }
};
