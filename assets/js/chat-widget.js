/**
 * Widget de diagnóstico (bot) da Remop.
 *
 * Não é um chat livre: conduz um passo a passo — pergunta uma coisa de
 * cada vez sobre o carro, avisa quando vai pesquisar na internet antes
 * de responder, e fecha com uma suspeita de diagnóstico + um botão pra
 * mandar só o resumo importante pro WhatsApp da equipe (não a conversa
 * inteira).
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
  var diagnosticoResumo = null;
  var servicoAtual = null;
  var mensagemPendente = null;

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

  function adicionarPesquisando(texto) {
    var bolha = document.createElement("div");
    bolha.className = "chat-widget__bolha chat-widget__bolha--pesquisando";
    var indicador = document.createElement("span");
    indicador.className = "chat-widget__pesquisando-icone";
    bolha.appendChild(indicador);
    bolha.appendChild(document.createTextNode(texto));
    elementos.mensagens.appendChild(bolha);
    elementos.mensagens.scrollTop = elementos.mensagens.scrollHeight;
    return bolha;
  }

  function adicionarDiagnostico(texto, resumoWhatsapp) {
    diagnosticoResumo = resumoWhatsapp;

    var card = document.createElement("div");
    card.className = "chat-widget__diagnostico";

    var paragrafo = document.createElement("p");
    paragrafo.textContent = texto;
    card.appendChild(paragrafo);

    if (resumoWhatsapp) {
      var identidade = (window.RemopIdentidade && window.RemopIdentidade.obter()) || {};
      var partes = [];
      if (identidade.nome) partes.push("Nome: " + identidade.nome);
      if (identidade.whatsapp) partes.push("WhatsApp: " + identidade.whatsapp);
      partes.push(resumoWhatsapp);

      var link = document.createElement("a");
      link.className = "botao botao--whatsapp botao--bloco";
      link.target = "_blank";
      link.rel = "noopener";
      link.href = (window.RemopWhatsApp ? window.RemopWhatsApp.montarLink(partes.join("\n")) : "#");
      link.textContent = "Enviar resumo pro WhatsApp";
      card.appendChild(link);
    }

    elementos.mensagens.appendChild(card);
    elementos.mensagens.scrollTop = elementos.mensagens.scrollHeight;
    return card;
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
    elementos.identidade.hidden = true;
    elementos.fallback.hidden = false;
  }

  async function chamarBot(modo, mensagemUsuario) {
    var config = window.REMOP_CONFIG || {};
    var identidade = (window.RemopIdentidade && window.RemopIdentidade.obter()) || {};

    var resposta = await fetch(config.chatBotEndpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        mensagem: mensagemUsuario || "",
        historico: historico,
        modo: modo,
        identidade: identidade,
        servico: servicoAtual,
      }),
    });

    if (!resposta.ok) {
      throw new Error("Endpoint do bot indisponível (" + resposta.status + ")");
    }

    return resposta.json();
  }

  /**
   * Processa a resposta do bot conforme a fase e, no caso de
   * "pesquisando", encadeia automaticamente uma segunda chamada (modo
   * "pesquisar") pra buscar de verdade — só depois de já ter avisado o
   * cliente que ia pesquisar.
   */
  async function processarResposta(dados, jaEncadeou) {
    if (dados.fase === "pesquisando") {
      adicionarPesquisando(dados.resposta);
      historico.push({ papel: "bot", texto: dados.resposta });

      if (jaEncadeou) return; // evita loop caso o modelo anuncie de novo

      var indicador = mostrarDigitando();
      try {
        var proximaResposta = await chamarBot("pesquisar", "");
        indicador.remove();
        await processarResposta(proximaResposta, true);
      } catch (erro) {
        indicador.remove();
        throw erro;
      }
      return;
    }

    if (dados.fase === "diagnostico") {
      adicionarDiagnostico(dados.resposta, dados.resumoWhatsapp);
      historico.push({ papel: "bot", texto: dados.resposta });
      return;
    }

    adicionarMensagem(dados.resposta, "bot");
    historico.push({ papel: "bot", texto: dados.resposta });
  }

  async function enviarTexto(texto) {
    texto = (texto || "").trim();
    if (!texto || modoFallbackAtivo) return;

    adicionarMensagem(texto, "usuario");
    historico.push({ papel: "usuario", texto: texto });
    if (window.RemopAnalytics) window.RemopAnalytics.registrarPergunta(texto);
    elementos.enviar.disabled = true;

    var indicador = mostrarDigitando();

    try {
      var dados = await chamarBot("normal", texto);
      indicador.remove();
      await processarResposta(dados, false);
    } catch (erro) {
      indicador.remove();
      console.warn("[Remop] Bot indisponível, ativando fallback pro WhatsApp:", erro.message);
      ativarFallback();
    } finally {
      elementos.enviar.disabled = false;
    }
  }

  function tratarEnvio(evento) {
    evento.preventDefault();
    var texto = elementos.input.value.trim();
    if (!texto) return;
    elementos.input.value = "";
    enviarTexto(texto);
  }

  function iniciarConversa() {
    if (elementos.mensagens.childElementCount) return;
    adicionarMensagem(
      "Vamos fazer um diagnóstico rápido. O que está acontecendo com o seu carro?",
      "bot"
    );
    elementos.input.focus();
  }

  function tratarEnvioIdentidade(evento) {
    evento.preventDefault();
    var nome = elementos.identidadeNome.value.trim();
    var whatsapp = elementos.identidadeWhatsapp.value.trim();

    if (!nome || whatsapp.replace(/\D/g, "").length < 10) {
      elementos.identidadeNome.reportValidity();
      return;
    }

    window.RemopIdentidade.salvar({ nome: nome, whatsapp: whatsapp });

    elementos.identidade.hidden = true;
    elementos.form.hidden = false;

    if (mensagemPendente) {
      var texto = mensagemPendente;
      mensagemPendente = null;
      enviarTexto(texto);
    } else {
      iniciarConversa();
    }
  }

  function reiniciarConversa() {
    historico = [];
    diagnosticoResumo = null;
    modoFallbackAtivo = false;
    elementos.mensagens.innerHTML = "";
    elementos.form.hidden = false;
    elementos.fallback.hidden = true;
  }

  /**
   * Abre o painel. Sem argumentos, é o atalho genérico do cabeçalho
   * (fluxo de diagnóstico padrão). Com `servico` ou `mensagemInicial`,
   * é um atalho específico (botão "Consultar valor" de um serviço, ou
   * a caixa "Descreva aqui o que você precisa") — sempre começa uma
   * conversa nova e já manda a primeira mensagem sozinho, sem esperar
   * o cliente digitar de novo.
   */
  function abrirPainel(opcoes) {
    opcoes = opcoes || {};

    elementos.painel.classList.add("aberto");
    document.querySelectorAll("[data-chat-abrir]").forEach(function (botao) {
      botao.setAttribute("aria-expanded", "true");
    });

    var novoFluxo = !!(opcoes.mensagemInicial || opcoes.servico);
    if (novoFluxo) {
      reiniciarConversa();
      servicoAtual = opcoes.servico || null;
    }

    if (elementos.painelIniciado && !novoFluxo) return;
    elementos.painelIniciado = true;

    var mensagemAutomatica =
      opcoes.mensagemInicial ||
      (opcoes.servico ? "Quero consultar o valor de: " + opcoes.servico + "." : null);

    var identidade = (window.RemopIdentidade && window.RemopIdentidade.obter()) || {};
    if (!identidade.nome || !identidade.whatsapp) {
      mensagemPendente = mensagemAutomatica;
      elementos.identidade.hidden = false;
      elementos.form.hidden = true;
      var primeiroCampo = elementos.identidade.querySelector("input");
      if (primeiroCampo) primeiroCampo.focus();
    } else if (mensagemAutomatica) {
      enviarTexto(mensagemAutomatica);
    } else {
      iniciarConversa();
    }
  }

  function fecharPainel() {
    elementos.painel.classList.remove("aberto");
    document.querySelectorAll("[data-chat-abrir]").forEach(function (botao) {
      botao.setAttribute("aria-expanded", "false");
    });
  }

  function iniciar() {
    var raiz = document.querySelector("[data-chat-widget]");
    if (!raiz) return;

    elementos = {
      painel: raiz.querySelector("[data-chat-painel]"),
      fechar: raiz.querySelector("[data-chat-fechar]"),
      mensagens: raiz.querySelector("[data-chat-mensagens]"),
      identidade: raiz.querySelector("[data-chat-identidade]"),
      identidadeNome: raiz.querySelector("[data-chat-identidade-nome]"),
      identidadeWhatsapp: raiz.querySelector("[data-chat-identidade-whatsapp]"),
      form: raiz.querySelector("[data-chat-form]"),
      input: raiz.querySelector("[data-chat-input]"),
      enviar: raiz.querySelector("[data-chat-enviar]"),
      fallback: raiz.querySelector("[data-chat-fallback]"),
      painelIniciado: false,
    };

    document.querySelectorAll("[data-chat-abrir]").forEach(function (botao) {
      botao.addEventListener("click", function () { abrirPainel(); });
    });
    document.querySelectorAll("[data-consultar-servico]").forEach(function (botao) {
      botao.addEventListener("click", function () {
        abrirPainel({ servico: botao.getAttribute("data-consultar-servico") });
      });
    });
    var perguntaLivre = document.querySelector("[data-pergunta-livre]");
    if (perguntaLivre) {
      perguntaLivre.addEventListener("submit", function (evento) {
        evento.preventDefault();
        var campo = perguntaLivre.querySelector("input");
        var texto = campo.value.trim();
        if (!texto) return;
        campo.value = "";
        abrirPainel({ mensagemInicial: texto });
      });
    }

    elementos.fechar.addEventListener("click", fecharPainel);
    elementos.form.addEventListener("submit", tratarEnvio);
    elementos.identidade.addEventListener("submit", tratarEnvioIdentidade);
  }

  document.addEventListener("DOMContentLoaded", iniciar);
})();
