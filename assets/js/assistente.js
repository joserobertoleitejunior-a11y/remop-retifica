/**
 * Assistente Remop: o mascote (Seu Remo) conduz uma saudação guiada
 * antes do cliente navegar o site — substitui o antigo portão de
 * entrada (formulário estático) por um fluxo de conversa com botões.
 *
 * Fluxo: saudação + botões de problema (ou "vou descrever") -> pergunta
 * o modelo do carro (se ainda não souber) -> pergunta nome/WhatsApp (se
 * ainda não souber) -> tela final com ação de continuar no chat com IA
 * ou ir direto pro serviço no site. A cada passo a pose do mascote muda.
 *
 * "Só quero navegar sozinho" fecha o assistente e ele some da tela —
 * só volta se o cliente clicar no ícone de mensagem do cabeçalho/hero
 * (data-chat-abrir), que este arquivo passa a controlar no lugar do
 * chat-widget.js (o chat-widget continua sendo quem mostra a conversa
 * de diagnóstico de verdade, chamado por este assistente quando o
 * cliente escolhe "Continuar com a IA").
 */
(function () {
  "use strict";

  var CHAVE_REGISTRADO = "remopVisitanteRegistrado";
  var CHAVE_PULOU = "remopVisitantePulouPortao";
  var CHAVE_NOME = "remopVisitanteNome";
  var CHAVE_WHATSAPP = "remopVisitanteWhatsapp";
  var CHAVE_CARRO = "remopVisitanteCarro";

  window.RemopIdentidade = {
    obter: function () {
      try {
        return {
          nome: localStorage.getItem(CHAVE_NOME) || "",
          whatsapp: localStorage.getItem(CHAVE_WHATSAPP) || "",
          carro: localStorage.getItem(CHAVE_CARRO) || "",
        };
      } catch (erro) {
        return { nome: "", whatsapp: "", carro: "" };
      }
    },
    salvar: function (dados) {
      try {
        if (dados.nome) localStorage.setItem(CHAVE_NOME, dados.nome);
        if (dados.whatsapp) localStorage.setItem(CHAVE_WHATSAPP, dados.whatsapp);
        if (dados.carro) localStorage.setItem(CHAVE_CARRO, dados.carro);
      } catch (erro) {
        /* sem storage — segue sem lembrar */
      }
    },
  };

  var SERVICOS = [
    "Retífica de Cabeçote",
    "Retífica de Bielas",
    "Retífica de Cilindro",
    "Manutenção e retífica de virabrequim",
    "Retoque e recuperação de bloco de motor",
    "Usinagem para motores automotivos",
    "Troca de correia dentada",
  ];

  var POSES = {
    bemvindo: "assets/img/mascote-bemvindo.png",
    duvida: "assets/img/mascote-duvida.png",
    apontando: "assets/img/mascote-apontando.png",
    positivo: "assets/img/mascote-positivo.png",
  };

  var elementos = {};
  var estado = {};

  function jaPassouPeloPortao() {
    try {
      return (
        localStorage.getItem(CHAVE_REGISTRADO) === "1" ||
        sessionStorage.getItem(CHAVE_PULOU) === "1"
      );
    } catch (erro) {
      return true;
    }
  }

  function travarScroll(travar) {
    document.body.style.overflow = travar ? "hidden" : "";
  }

  async function salvarVisitante(dados) {
    var supabaseInfo = window.RemopSupabase;
    if (!supabaseInfo || !supabaseInfo.pronto) return false;

    var resultado = await supabaseInfo.client.from("visitantes").insert({
      nome: dados.nome,
      whatsapp: dados.whatsapp,
      modelo_carro: dados.modelo || "",
      ano_carro: dados.ano || "",
      origem: "assistente-mascote",
      pagina: location.pathname,
    });
    if (resultado.error) throw resultado.error;
    return true;
  }

  function trocarPose(nome) {
    var src = POSES[nome];
    if (!src || !elementos.imagem) return;
    if (elementos.imagem.getAttribute("src") === src) return;
    elementos.imagem.classList.add("assistente-remop__mascote--trocando");
    setTimeout(function () {
      elementos.imagem.setAttribute("src", src);
      elementos.imagem.classList.remove("assistente-remop__mascote--trocando");
    }, 160);
  }

  function definirFala(texto) {
    elementos.fala.textContent = texto;
  }

  function limparStatus() {
    elementos.status.textContent = "";
    elementos.status.className = "mensagem-status assistente-remop__status";
  }

  function mostrarErro(texto) {
    elementos.status.textContent = texto;
    elementos.status.className = "mensagem-status mensagem-status--erro";
  }

  /* ---------------- Passos do fluxo ---------------- */

  function renderEscolha() {
    limparStatus();
    trocarPose("bemvindo");
    definirFala("Olá, somos da Remop! Como podemos te ajudar?");

    var html = '<div class="assistente-remop__botoes" data-lista-servicos>';
    SERVICOS.forEach(function (servico) {
      html +=
        '<button type="button" class="assistente-remop__chip" data-servico="' +
        servico.replace(/"/g, "&quot;") +
        '">' +
        servico +
        "</button>";
    });
    html +=
      '<button type="button" class="assistente-remop__chip assistente-remop__chip--outro" data-outro-problema>Outro problema, vou descrever</button>' +
      "</div>";
    elementos.corpo.innerHTML = html;

    elementos.corpo.querySelectorAll("[data-servico]").forEach(function (botao) {
      botao.addEventListener("click", function () {
        estado.problema = botao.getAttribute("data-servico");
        estado.descricaoLivre = null;
        avancarAposProblema();
      });
    });
    var botaoOutro = elementos.corpo.querySelector("[data-outro-problema]");
    if (botaoOutro) botaoOutro.addEventListener("click", renderDescricao);
  }

  function renderDescricao() {
    limparStatus();
    trocarPose("duvida");
    definirFala("Pode contar com suas palavras — o que está acontecendo com o carro?");

    elementos.corpo.innerHTML =
      '<form class="campo" data-form-descricao>' +
      '<textarea data-campo-descricao rows="3" placeholder="Ex: o carro está fazendo um barulho estranho ao acelerar..." required></textarea>' +
      '<button class="botao botao--primario botao--bloco" type="submit" style="margin-top:10px;">Enviar</button>' +
      "</form>";

    var form = elementos.corpo.querySelector("[data-form-descricao]");
    form.addEventListener("submit", function (evento) {
      evento.preventDefault();
      var texto = form.querySelector("[data-campo-descricao]").value.trim();
      if (!texto) return;
      estado.descricaoLivre = texto;
      estado.problema = null;
      avancarAposProblema();
    });
    var campo = form.querySelector("[data-campo-descricao]");
    if (campo) campo.focus();
  }

  function avancarAposProblema() {
    var identidade = window.RemopIdentidade.obter();
    if (!identidade.carro) {
      renderModelo();
    } else if (!identidade.nome || !identidade.whatsapp) {
      renderIdentidade();
    } else {
      renderFinal();
    }
  }

  function renderModelo() {
    limparStatus();
    trocarPose("duvida");
    definirFala("Legal! Qual o modelo do carro (e o ano, se souber)?");

    elementos.corpo.innerHTML =
      '<form data-form-modelo>' +
      '<div class="campo campo--dupla">' +
      '<div><label for="assistente-modelo">Modelo</label>' +
      '<input id="assistente-modelo" data-campo-modelo type="text" required placeholder="Ex: Onix, Corsa, S10..."></div>' +
      '<div><label for="assistente-ano">Ano</label>' +
      '<input id="assistente-ano" data-campo-ano type="text" inputmode="numeric" maxlength="4" placeholder="2018"></div>' +
      "</div>" +
      '<button class="botao botao--primario botao--bloco" type="submit">Continuar</button>' +
      "</form>";

    var form = elementos.corpo.querySelector("[data-form-modelo]");
    form.addEventListener("submit", function (evento) {
      evento.preventDefault();
      var modelo = form.querySelector("[data-campo-modelo]").value.trim();
      var ano = form.querySelector("[data-campo-ano]").value.trim();
      if (!modelo) return;
      estado.modelo = modelo;
      estado.ano = ano;
      window.RemopIdentidade.salvar({ carro: [modelo, ano].filter(Boolean).join(" ") });

      var identidade = window.RemopIdentidade.obter();
      if (!identidade.nome || !identidade.whatsapp) {
        renderIdentidade();
      } else {
        renderFinal();
      }
    });
    var campo = form.querySelector("[data-campo-modelo]");
    if (campo) campo.focus();
  }

  function renderIdentidade() {
    limparStatus();
    trocarPose("duvida");
    definirFala("Só mais duas coisinhas, pra eu te chamar certinho e a equipe poder entrar em contato:");

    elementos.corpo.innerHTML =
      '<form data-form-identidade>' +
      '<div class="campo"><label for="assistente-nome">Seu nome</label>' +
      '<input id="assistente-nome" data-campo-nome type="text" required autocomplete="name" placeholder="Seu nome completo"></div>' +
      '<div class="campo"><label for="assistente-whatsapp">WhatsApp</label>' +
      '<input id="assistente-whatsapp" data-campo-whatsapp type="tel" required autocomplete="tel" placeholder="(15) 90000-0000"></div>' +
      '<button class="botao botao--primario botao--bloco" type="submit">Continuar</button>' +
      "</form>";

    var form = elementos.corpo.querySelector("[data-form-identidade]");
    form.addEventListener("submit", async function (evento) {
      evento.preventDefault();
      var nome = form.querySelector("[data-campo-nome]").value.trim();
      var whatsapp = form.querySelector("[data-campo-whatsapp]").value.trim();
      if (!nome || whatsapp.replace(/\D/g, "").length < 10) {
        mostrarErro("Preenche nome e WhatsApp certinho pra continuar.");
        return;
      }

      var botaoEnviar = form.querySelector('[type="submit"]');
      botaoEnviar.disabled = true;

      window.RemopIdentidade.salvar({ nome: nome, whatsapp: whatsapp });

      try {
        await salvarVisitante({
          nome: nome,
          whatsapp: whatsapp,
          modelo: estado.modelo || "",
          ano: estado.ano || "",
        });
      } catch (erro) {
        console.warn("[Remop] Não deu pra salvar o visitante agora:", erro);
      }

      try {
        localStorage.setItem(CHAVE_REGISTRADO, "1");
      } catch (erro) {
        /* sem storage — segue o baile */
      }

      botaoEnviar.disabled = false;
      renderFinal();
    });
    var campo = form.querySelector("[data-campo-nome]");
    if (campo) campo.focus();
  }

  function irParaServico(nomeServico) {
    fecharAssistente();
    var estaNoIndex = /(^\/$|index\.html$)/.test(location.pathname);
    if (!estaNoIndex) {
      location.href = "index.html#servicos";
      return;
    }
    var alvoBotao = null;
    try {
      alvoBotao = document.querySelector('[data-consultar-servico="' + nomeServico.replace(/"/g, '\\"') + '"]');
    } catch (erro) {
      alvoBotao = null;
    }
    var card = alvoBotao ? alvoBotao.closest(".card-servico") : document.getElementById("servicos");
    if (card) {
      card.scrollIntoView({ behavior: "smooth", block: "center" });
      card.classList.add("card-servico--destaque");
      setTimeout(function () {
        card.classList.remove("card-servico--destaque");
      }, 2200);
    }
  }

  function renderFinal() {
    limparStatus();
    trocarPose(estado.problema ? "apontando" : "positivo");
    var identidade = window.RemopIdentidade.obter();
    var nomeCliente = identidade.nome ? identidade.nome.split(" ")[0] : "";
    definirFala(
      (nomeCliente ? "Show, " + nomeCliente + "! " : "Show! ") +
      "Já anotei tudo por aqui. Quer continuar agora com nossa IA de diagnóstico, ou prefere dar uma olhada no site com calma?"
    );

    var html = '<div class="assistente-remop__acoes">';
    html += '<button class="botao botao--primario botao--bloco" type="button" data-acao-chat>Continuar com a IA</button>';
    if (estado.problema) {
      html += '<button class="botao botao--outline botao--bloco" type="button" data-acao-servico>Ver esse serviço no site</button>';
    }
    html += '<button class="botao botao--outline botao--bloco" type="button" data-acao-fechar>Só quero navegar, obrigado</button>';
    html += "</div>";
    elementos.corpo.innerHTML = html;

    var botaoChat = elementos.corpo.querySelector("[data-acao-chat]");
    botaoChat.addEventListener("click", function () {
      var mensagem = estado.problema
        ? "Quero saber mais sobre: " + estado.problema
        : estado.descricaoLivre || "Preciso de ajuda com meu carro.";
      fecharAssistente();
      if (window.RemopChatWidget) window.RemopChatWidget.abrirPainel({ mensagemInicial: mensagem });
    });

    var botaoServico = elementos.corpo.querySelector("[data-acao-servico]");
    if (botaoServico) {
      botaoServico.addEventListener("click", function () {
        irParaServico(estado.problema);
      });
    }

    var botaoFechar = elementos.corpo.querySelector("[data-acao-fechar]");
    botaoFechar.addEventListener("click", fecharAssistente);
  }

  /* ---------------- Abrir / fechar ---------------- */

  function fecharAssistente() {
    if (elementos.raiz) elementos.raiz.hidden = true;
    travarScroll(false);
  }

  function navegarSozinho() {
    try {
      sessionStorage.setItem(CHAVE_PULOU, "1");
    } catch (erro) {
      /* armazenamento bloqueado — só fecha mesmo assim */
    }
    fecharAssistente();
  }

  function abrirAssistente() {
    estado = {};
    elementos.raiz.hidden = false;
    travarScroll(true);
    renderEscolha();
  }

  function montar() {
    var raiz = document.createElement("div");
    raiz.className = "assistente-remop";
    raiz.setAttribute("data-assistente-remop", "");
    raiz.hidden = true;

    raiz.innerHTML =
      '<div class="assistente-remop__caixa">' +
      '<button class="assistente-remop__navegar-sozinho" type="button" data-navegar-sozinho>Só quero navegar sozinho</button>' +
      '<div class="assistente-remop__topo">' +
      '<img class="assistente-remop__mascote" data-assistente-imagem src="' + POSES.bemvindo + '" alt="Seu Remo, assistente da Remop" width="76" height="139">' +
      '<div class="assistente-remop__marca">' +
      '<img class="assistente-remop__logo" src="assets/img/logo-remop.png" alt="Remop Retífica de Motores e Auto Peças">' +
      "</div>" +
      "</div>" +
      '<div class="assistente-remop__fala"><p data-assistente-fala></p></div>' +
      '<div data-assistente-corpo></div>' +
      '<p class="mensagem-status assistente-remop__status" data-assistente-status></p>' +
      "</div>";

    document.body.appendChild(raiz);

    elementos = {
      raiz: raiz,
      imagem: raiz.querySelector("[data-assistente-imagem]"),
      fala: raiz.querySelector("[data-assistente-fala]"),
      corpo: raiz.querySelector("[data-assistente-corpo]"),
      status: raiz.querySelector("[data-assistente-status]"),
    };

    raiz.querySelector("[data-navegar-sozinho]").addEventListener("click", navegarSozinho);

    document.querySelectorAll("[data-chat-abrir], [data-mascote-decorativo]").forEach(function (botao) {
      botao.addEventListener("click", function (evento) {
        evento.preventDefault();
        abrirAssistente();
      });
    });

    if (!jaPassouPeloPortao()) {
      abrirAssistente();
    }
  }

  document.addEventListener("DOMContentLoaded", montar);
})();
