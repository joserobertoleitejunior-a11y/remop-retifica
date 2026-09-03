/**
 * Assistente Remop: o mascote (Seu Remo) conduz uma saudação guiada
 * antes do cliente navegar o site — substitui o antigo portão de
 * entrada (formulário estático) por um fluxo de conversa com botões.
 *
 * Fluxo: menu principal (problema no carro / história / localização /
 * fotos) -> cada opção direciona pra parte certa do site. "Problema no
 * carro" continua num sub-fluxo: botões de sintoma comum (ou "vou
 * descrever") -> modelo do carro (se ainda não souber) -> nome/WhatsApp
 * (se ainda não souber) -> tela final com IA, agendamento ou consulta
 * de valor. A cada passo a pose do mascote muda.
 *
 * "Só quero navegar sozinho" fecha o assistente e ele some da tela.
 * Ele também se despede sozinho (pausa pro café) depois de um tempo
 * parado sem interação. Nos dois casos só volta se o cliente clicar no
 * ícone de mensagem do cabeçalho/hero (data-chat-abrir), que este
 * arquivo controla no lugar do chat-widget.js (o chat-widget continua
 * sendo quem mostra a conversa de diagnóstico de verdade, chamado por
 * este assistente quando o cliente escolhe "Continuar com a IA").
 */
(function () {
  "use strict";

  var CHAVE_REGISTRADO = "remopVisitanteRegistrado";
  var CHAVE_PULOU = "remopVisitantePulouPortao";
  var CHAVE_NOME = "remopVisitanteNome";
  var CHAVE_WHATSAPP = "remopVisitanteWhatsapp";
  var CHAVE_CARRO = "remopVisitanteCarro";

  var TEMPO_INATIVIDADE_MS = 40000;
  var URL_GALERIA = "institucional.html#galeria";

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
    acenando: "assets/img/mascote-acenando.png",
    relaxado: "assets/img/mascote-relaxado.png",
  };

  var ICONES = {
    chave: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14.7 6.3a4 4 0 1 0-5.4 5.4L3 18v3h3l6.3-6.3a4 4 0 0 0 5.4-5.4z"/></svg>',
    historia: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>',
    local: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 21s7-6.5 7-12a7 7 0 1 0-14 0c0 5.5 7 12 7 12z"/><circle cx="12" cy="9" r="2.5"/></svg>',
    fotos: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="15" rx="2"/><path d="M3 16l5-5 4 4 3-3 6 6"/><circle cx="8" cy="9" r="1.5"/></svg>',
    voltar: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="14" height="14" aria-hidden="true"><path d="M15 18l-6-6 6-6"/></svg>',
  };

  var elementos = {};
  var estado = {};
  var timerInatividade = null;

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

  function marcarPulou() {
    try {
      sessionStorage.setItem(CHAVE_PULOU, "1");
    } catch (erro) {
      /* armazenamento bloqueado — segue o baile */
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

  function botaoVoltar(aoClicar) {
    return (
      '<button type="button" class="assistente-remop__voltar" data-voltar>' +
      ICONES.voltar +
      " Voltar</button>"
    );
  }

  function ligarBotaoVoltar(aoClicar) {
    var botao = elementos.corpo.querySelector("[data-voltar]");
    if (botao) botao.addEventListener("click", aoClicar);
  }

  /* ---------------- Inatividade: ele se despede pro café ---------------- */

  function reiniciarTimerInatividade() {
    if (timerInatividade) clearTimeout(timerInatividade);
    if (elementos.raiz && elementos.raiz.hidden) return;
    timerInatividade = setTimeout(sairParaCafe, TEMPO_INATIVIDADE_MS);
  }

  function pararTimerInatividade() {
    if (timerInatividade) clearTimeout(timerInatividade);
    timerInatividade = null;
  }

  function sairParaCafe() {
    trocarPose("relaxado");
    definirFala("Vou tomar um cafézinho! Qualquer coisa, é só clicar no ícone de chat de novo que eu volto correndo.");
    elementos.corpo.innerHTML = "";
    limparStatus();
    setTimeout(function () {
      marcarPulou();
      fecharAssistente();
    }, 2600);
  }

  /* ---------------- Passo 0: menu principal ---------------- */

  function renderMenu() {
    limparStatus();
    trocarPose("bemvindo");
    definirFala("Oi, eu sou o Seu Remo, da Remop! Me diz o que você precisa que eu te levo direto lá:");

    elementos.corpo.innerHTML =
      '<div class="assistente-remop__botoes assistente-remop__botoes--menu">' +
      '<button type="button" class="assistente-remop__chip assistente-remop__chip--menu" data-menu="problema">' + ICONES.chave + "Tenho um problema no carro</button>" +
      '<button type="button" class="assistente-remop__chip assistente-remop__chip--menu" data-menu="historia">' + ICONES.historia + "Conhecer a história da Remop</button>" +
      '<button type="button" class="assistente-remop__chip assistente-remop__chip--menu" data-menu="local">' + ICONES.local + "Como chegar até a oficina</button>" +
      '<button type="button" class="assistente-remop__chip assistente-remop__chip--menu" data-menu="fotos">' + ICONES.fotos + "Ver fotos da oficina</button>" +
      "</div>";

    elementos.corpo.querySelector('[data-menu="problema"]').addEventListener("click", renderEscolhaServico);
    elementos.corpo.querySelector('[data-menu="historia"]').addEventListener("click", function () {
      irParaPagina("historia");
    });
    elementos.corpo.querySelector('[data-menu="local"]').addEventListener("click", function () {
      irParaPagina("local");
    });
    elementos.corpo.querySelector('[data-menu="fotos"]').addEventListener("click", function () {
      irParaPagina("fotos");
    });
  }

  function irParaPagina(destino) {
    trocarPose("acenando");
    var textos = {
      historia: "A Remop existe desde 1989, aqui em Itapetininga — já são gerações de clientes. Vou te levar pra conhecer a história completa!",
      local: "Bora! Vou te levar pro endereço, mapa e horário de atendimento.",
      fotos: "Boa escolha! Vou te levar pras fotos reais da nossa oficina.",
    };
    var urls = {
      historia: "institucional.html",
      local: "localizacao.html",
      fotos: URL_GALERIA,
    };
    definirFala(textos[destino]);
    elementos.corpo.innerHTML = "";
    pararTimerInatividade();
    // Marca como "pulou" antes de navegar — senão o assistente reabre
    // sozinho assim que a página de destino carrega, tampando bem o
    // conteúdo que ele acabou de indicar.
    marcarPulou();
    setTimeout(function () {
      location.href = urls[destino];
    }, 700);
  }

  /* ---------------- Sub-fluxo: problema no carro ---------------- */

  function renderEscolhaServico() {
    limparStatus();
    trocarPose("bemvindo");
    definirFala("Beleza! Qual dessas opções parece mais com o que está rolando?");

    var html = botaoVoltar() + '<div class="assistente-remop__botoes" data-lista-servicos>';
    SERVICOS.forEach(function (servico) {
      html +=
        '<button type="button" class="assistente-remop__chip" data-servico="' +
        servico.replace(/"/g, "&quot;") +
        '">' +
        servico +
        "</button>";
    });
    html +=
      '<button type="button" class="assistente-remop__chip assistente-remop__chip--outro" data-outro-problema>Não sei explicar, é outra coisa</button>' +
      "</div>";
    elementos.corpo.innerHTML = html;

    ligarBotaoVoltar(renderMenu);
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
    definirFala("Sem problema — me conta com suas palavras o que o carro anda fazendo:");

    elementos.corpo.innerHTML =
      botaoVoltar() +
      '<form class="campo" data-form-descricao>' +
      '<textarea data-campo-descricao rows="3" placeholder="Ex: o carro está fazendo um barulho estranho ao acelerar..." required></textarea>' +
      '<button class="botao botao--primario botao--bloco" type="submit" style="margin-top:10px;">Enviar</button>' +
      "</form>";

    ligarBotaoVoltar(renderEscolhaServico);
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
    definirFala("Show! E qual carro é esse — modelo e ano, se você souber?");

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
    definirFala("Só mais uma coisinha: seu nome e um WhatsApp, pra equipe poder te chamar.");

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
      "Já anotei tudo por aqui. Como prefere continuar?"
    );

    var html = '<div class="assistente-remop__acoes">';
    html += '<button class="botao botao--primario botao--bloco" type="button" data-acao-chat>Continuar com a IA de diagnóstico</button>';
    html += '<button class="botao botao--outline botao--bloco" type="button" data-acao-agendar>Agendar avaliação</button>';
    if (estado.problema) {
      html += '<button class="botao botao--outline botao--bloco" type="button" data-acao-servico>Consultar valor desse serviço</button>';
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

    var botaoAgendar = elementos.corpo.querySelector("[data-acao-agendar]");
    if (botaoAgendar) {
      botaoAgendar.addEventListener("click", function () {
        fecharAssistente();
        if (window.RemopAgendamento) window.RemopAgendamento.abrir();
      });
    }

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
    pararTimerInatividade();
  }

  function navegarSozinho() {
    marcarPulou();
    fecharAssistente();
  }

  function abrirAssistente() {
    estado = {};
    elementos.raiz.hidden = false;
    travarScroll(true);
    renderMenu();
    reiniciarTimerInatividade();
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
      '<img class="assistente-remop__mascote" data-assistente-imagem src="' + POSES.bemvindo + '" alt="Seu Remo, assistente da Remop" width="68" height="124">' +
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
    raiz.addEventListener("click", reiniciarTimerInatividade);
    raiz.addEventListener("input", reiniciarTimerInatividade);

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
