/**
 * Widget de atendimento (bot) da Remop.
 *
 * Enquanto o site roda só no GitHub Pages, a Netlify Function não existe,
 * então a primeira chamada falha e o widget cai automaticamente no
 * fallback: mensagem amigável + botão direto pro WhatsApp humano. Quando
 * o deploy migrar pro Netlify com ANTHROPIC_API_KEY configurada, a mesma
 * chamada passa a funcionar normalmente, sem trocar nenhum código aqui.
 */
(function () {
  "use strict";

  var historico = [];
  var elementos = {};
  var modoFallbackAtivo = false;

  function criarBolha(texto, tipo) {
    var bolha = document.createElement("div");
    bolha.className = "chat-widget__bolha chat-widget__bolha--" + tipo;
    bolha.textContent = texto;
    return bolha;
  }

  function adicionarMensagem(texto, tipo) {
    var bolha = criarBolha(texto, tipo);
    elementos.mensagens.appendChild(bolha);
    elementos.mensagens.scrollTop = elementos.mensagens.scrollHeight;
    return bolha;
  }

  function mostrarDigitando() {
    var indicador = document.createElement("div");
    indicador.className = "chat-widget__digitando";
    indicador.setAttribute("data-indicador-digitando", "true");
    indicador.innerHTML = "<span></span><span></span><span></span>";
    elementos.mensagens.appendChild(indicador);
    elementos.mensagens.scrollTop = elementos.mensagens.scrollHeight;
    return indicador;
  }

  function ativarFallback() {
    if (modoFallbackAtivo) return;
    modoFallbackAtivo = true;

    adicionarMensagem(
      "Atendimento por IA chega em breve por aqui — mas você pode falar direto com a nossa equipe agora mesmo no WhatsApp.",
      "sistema"
    );

    elementos.form.hidden = true;
    elementos.fallback.hidden = false;
  }

  async function enviarParaBot(mensagemUsuario) {
    var config = window.REMOP_CONFIG || {};
    var resposta = await fetch(config.chatBotEndpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        mensagem: mensagemUsuario,
        historico: historico,
      }),
    });

    if (!resposta.ok) {
      throw new Error("Endpoint do bot indisponível (" + resposta.status + ")");
    }

    var dados = await resposta.json();
    return dados.resposta;
  }

  async function tratarEnvio(evento) {
    evento.preventDefault();
    var texto = elementos.input.value.trim();
    if (!texto || modoFallbackAtivo) return;

    adicionarMensagem(texto, "usuario");
    historico.push({ papel: "usuario", texto: texto });
    elementos.input.value = "";
    elementos.enviar.disabled = true;

    var indicador = mostrarDigitando();

    try {
      var respostaBot = await enviarParaBot(texto);
      indicador.remove();
      adicionarMensagem(respostaBot, "bot");
      historico.push({ papel: "bot", texto: respostaBot });
    } catch (erro) {
      indicador.remove();
      console.warn("[Remop] Bot indisponível, ativando fallback pro WhatsApp:", erro.message);
      ativarFallback();
    } finally {
      elementos.enviar.disabled = false;
    }
  }

  function alternarPainel() {
    var aberto = elementos.painel.classList.toggle("aberto");
    elementos.botaoAbrir.setAttribute("aria-expanded", aberto ? "true" : "false");
    if (aberto && !elementos.mensagens.childElementCount) {
      adicionarMensagem(
        "Olá! Posso te ajudar a entender qual serviço você precisa. No fim, te conecto com um atendente humano no WhatsApp para fechar o orçamento.",
        "bot"
      );
    }
  }

  function iniciar() {
    var raiz = document.querySelector("[data-chat-widget]");
    if (!raiz) return;

    elementos = {
      botaoAbrir: raiz.querySelector("[data-chat-abrir]"),
      painel: raiz.querySelector("[data-chat-painel]"),
      fechar: raiz.querySelector("[data-chat-fechar]"),
      mensagens: raiz.querySelector("[data-chat-mensagens]"),
      form: raiz.querySelector("[data-chat-form]"),
      input: raiz.querySelector("[data-chat-input]"),
      enviar: raiz.querySelector("[data-chat-enviar]"),
      fallback: raiz.querySelector("[data-chat-fallback]"),
    };

    elementos.botaoAbrir.addEventListener("click", alternarPainel);
    elementos.fechar.addEventListener("click", alternarPainel);
    elementos.form.addEventListener("submit", tratarEnvio);
  }

  document.addEventListener("DOMContentLoaded", iniciar);
})();
