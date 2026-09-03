/**
 * Tour guiado pelo site: o mascote fica num canto fixo da tela (nunca
 * na frente do conteúdo, nunca trava o scroll) e vai apontando pros
 * pedaços reais da página conforme o cliente clica em "Próximo" —
 * cada passo rola até a seção de verdade e muda a pose/fala de acordo
 * com o que está sendo mostrado.
 *
 * Só existe na home (onde os alvos abaixo realmente existem). Iniciado
 * pelo botão "Conhecer o site" do splash em assistente.js, exposto via
 * window.RemopTour.iniciar().
 */
(function () {
  "use strict";

  var TEMPO_INATIVIDADE_MS = 45000;

  var PASSOS = [
    {
      alvo: "#topo .hero__conteudo",
      pose: "bemvindo",
      texto: "Esse é o começo — aqui em cima você já vê quem somos e pode chamar a gente no WhatsApp direto.",
    },
    {
      alvo: ".prova-rapida",
      pose: "confiante",
      texto: "Esses números mostram nossa experiência: décadas no mesmo endereço, atendendo gerações da mesma família.",
    },
    {
      alvo: ".vitrine",
      pose: "aprovando",
      texto: "Aqui embaixo, carros reais que estão em serviço na nossa oficina agora mesmo — sem estúdio, sem cenário.",
    },
    {
      alvo: "#servicos",
      pose: "apontando",
      texto: "Esses são nossos serviços. Clica em “Consultar valor” embaixo de qualquer um deles pra já mandar sua dúvida.",
    },
    {
      alvo: ".caixa-pergunta-ia",
      pose: "duvida",
      texto: "Prefere só descrever o problema com suas palavras? Escreve aqui que a nossa IA já te ajuda a entender o que pode ser.",
    },
    {
      alvo: ".cabecalho",
      pose: "apontando",
      texto: "Lá em cima, a qualquer momento, você acessa nossa história, a localização e pode agendar uma avaliação.",
    },
    {
      alvo: null,
      pose: "positivo",
      texto: "Prontinho! Fica à vontade pra explorar o site com calma. Se precisar de mim de novo, é só clicar no ícone de chat.",
    },
  ];

  var elementos = {};
  var passoAtual = 0;
  var ativo = false;
  var timerInatividade = null;

  function pararTimer() {
    if (timerInatividade) clearTimeout(timerInatividade);
    timerInatividade = null;
  }

  function reiniciarTimer() {
    pararTimer();
    if (!ativo) return;
    timerInatividade = setTimeout(sairParaCafe, TEMPO_INATIVIDADE_MS);
  }

  function trocarPose(nome) {
    var src = "assets/img/mascote-" + nome + ".png";
    if (elementos.imagem.getAttribute("src") === src) return;
    elementos.imagem.classList.add("tour-remo__mascote--trocando");
    setTimeout(function () {
      elementos.imagem.setAttribute("src", src);
      elementos.imagem.classList.remove("tour-remo__mascote--trocando");
    }, 150);
  }

  function sairParaCafe() {
    elementos.texto.textContent = "Vou tomar um cafézinho! Clica no ícone de chat quando quiser que eu volte a te acompanhar.";
    elementos.nav.hidden = true;
    setTimeout(encerrarTour, 2400);
  }

  function mostrarPasso(indice) {
    passoAtual = Math.max(0, Math.min(indice, PASSOS.length - 1));
    var passo = PASSOS[passoAtual];

    trocarPose(passo.pose);
    elementos.texto.textContent = passo.texto;
    elementos.contador.textContent = (passoAtual + 1) + " de " + PASSOS.length;
    elementos.anterior.disabled = passoAtual === 0;
    elementos.proximo.textContent = passoAtual === PASSOS.length - 1 ? "Concluir" : "Próximo ›";
    elementos.nav.hidden = false;

    if (passo.alvo) {
      var el = document.querySelector(passo.alvo);
      if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
    }
    reiniciarTimer();
  }

  function proximo() {
    if (passoAtual >= PASSOS.length - 1) {
      encerrarTour();
      return;
    }
    mostrarPasso(passoAtual + 1);
  }

  function anterior() {
    mostrarPasso(passoAtual - 1);
  }

  function encerrarTour() {
    ativo = false;
    pararTimer();
    document.body.classList.remove("tour-ativo");
    if (elementos.raiz) elementos.raiz.hidden = true;
  }

  function iniciarTour() {
    if (!elementos.raiz) return;
    ativo = true;
    document.body.classList.add("tour-ativo");
    elementos.raiz.hidden = false;
    mostrarPasso(0);
  }

  window.RemopTour = { iniciar: iniciarTour };

  function montar() {
    // Só existe na home — nas outras páginas os alvos não existem.
    if (!document.getElementById("servicos")) return;

    var raiz = document.createElement("div");
    raiz.className = "tour-remo";
    raiz.setAttribute("data-tour-remo", "");
    raiz.hidden = true;

    raiz.innerHTML =
      '<button class="tour-remo__pular" type="button" data-tour-pular>Pular tour</button>' +
      '<div class="tour-remo__corpo">' +
      '<img class="tour-remo__mascote" data-tour-imagem src="assets/img/mascote-bemvindo.png" alt="Seu Remo">' +
      '<div class="tour-remo__balao">' +
      "<p data-tour-texto></p>" +
      '<div class="tour-remo__nav" data-tour-nav>' +
      '<span class="tour-remo__contador" data-tour-contador></span>' +
      '<button type="button" class="tour-remo__seta" data-tour-anterior aria-label="Passo anterior">&lsaquo;</button>' +
      '<button type="button" class="botao botao--primario botao--sm" data-tour-proximo>Próximo &rsaquo;</button>' +
      "</div></div></div>";

    document.body.appendChild(raiz);

    elementos = {
      raiz: raiz,
      imagem: raiz.querySelector("[data-tour-imagem]"),
      texto: raiz.querySelector("[data-tour-texto]"),
      nav: raiz.querySelector("[data-tour-nav]"),
      contador: raiz.querySelector("[data-tour-contador]"),
      anterior: raiz.querySelector("[data-tour-anterior]"),
      proximo: raiz.querySelector("[data-tour-proximo]"),
    };

    elementos.proximo.addEventListener("click", proximo);
    elementos.anterior.addEventListener("click", anterior);
    raiz.querySelector("[data-tour-pular]").addEventListener("click", encerrarTour);
    raiz.addEventListener("click", reiniciarTimer);
  }

  document.addEventListener("DOMContentLoaded", montar);
})();
