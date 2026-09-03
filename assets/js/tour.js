/**
 * Tour guiado pelo site: o Remo aparece diretamente sobre o conteúdo
 * (PNG com fundo transparente, sem caixa ao redor dele) e se posiciona
 * perto da seção que está sendo apresentada em cada passo — inclusive
 * atravessando páginas (institucional, localização). Tudo que ele fala
 * sai num balão ancorado nele, com uma fonte "de mão" só pra essa voz.
 *
 * O estado do passo atual fica no localStorage pra sobreviver à troca
 * de página (o tour navega de verdade entre index/institucional/
 * localizacao.html). Iniciado pelo botão "Conhecer o site" do splash
 * em assistente.js, exposto via window.RemopTour.iniciar().
 */
(function () {
  "use strict";

  var CHAVE_ESTADO = "remopTourEstado";
  var TEMPO_INATIVIDADE_MS = 45000;

  var PASSOS = [
    {
      pagina: "index.html",
      alvo: "#topo .hero__conteudo",
      pose: "bemvindo",
      texto: "E aí! Eu sou o Seu Remo. Bora dar uma volta rapidinha pelo site?",
    },
    {
      pagina: "institucional.html",
      alvo: ".hero--institucional .hero__conteudo",
      pose: "confiante",
      texto: "Aqui é onde contamos nossa história: no ar desde 1989, no mesmo endereço, com famílias inteiras confiando na gente.",
    },
    {
      pagina: "index.html",
      alvo: "#servicos",
      pose: "apontando",
      texto: "Esses são nossos serviços. Clica em “Consultar valor” embaixo de qualquer um pra já mandar sua dúvida.",
    },
    {
      pagina: "localizacao.html",
      alvo: ".localizacao__mapa",
      pose: "apontando",
      texto: "Bem fácil de achar: Av. 5 de Novembro, 1301, Vila Nastri, a uns 5 minutinhos do centro de Itapetininga. Dá uma olhada no mapa!",
    },
    {
      pagina: "localizacao.html",
      alvo: "[data-abrir-agendamento]",
      pose: "positivo",
      texto: "Bora marcar uma avaliação? É rapidinho e sem compromisso.",
      acao: { rotulo: "Agendar avaliação", tipo: "agendamento" },
    },
    {
      pagina: "index.html",
      alvo: "#topo .hero__conteudo",
      pose: "acenando",
      texto: "Prontinho! Você já conhece o site inteiro. Fica à vontade pra explorar com calma — se precisar de mim de novo, é só clicar no ícone de chat.",
    },
  ];

  var elementos = {};
  var passoAtual = 0;
  var ativo = false;
  var timerInatividade = null;
  var timerResize = null;

  function paginaAtual() {
    var nome = location.pathname.split("/").pop();
    return nome === "" ? "index.html" : nome;
  }

  function lerEstado() {
    try {
      var bruto = localStorage.getItem(CHAVE_ESTADO);
      return bruto ? JSON.parse(bruto) : null;
    } catch (erro) {
      return null;
    }
  }

  function salvarEstado(passo) {
    try {
      localStorage.setItem(CHAVE_ESTADO, JSON.stringify({ ativo: true, passo: passo }));
    } catch (erro) {
      /* sem storage — segue sem lembrar entre páginas */
    }
  }

  function limparEstado() {
    try {
      localStorage.removeItem(CHAVE_ESTADO);
    } catch (erro) {
      /* nada a limpar */
    }
  }

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
    elementos.acaoWrap.hidden = true;
    setTimeout(encerrarTour, 2400);
  }

  /* ---------------- Posicionamento dinâmico perto do alvo ---------------- */

  // scrollIntoView({block:"center"}) é assíncrono e a duração do scroll
  // suave varia com a distância e o aparelho — esperar um tempo fixo
  // pra "adivinhar" quando ele terminou é frágil (em celular real, uma
  // rolagem longa pode não ter acabado ainda, e o Remo travava numa
  // posição no meio do caminho). Em vez de esperar, calculamos aqui,
  // na hora, onde o alvo VAI PARAR na tela depois de centralizado —
  // pura matemática a partir da posição atual, sem depender do tempo
  // de animação.
  function calcularRetanguloFinal(el) {
    var r = el.getBoundingClientRect();
    var scrollAtual = window.scrollY || window.pageYOffset;
    var alturaJanela = window.innerHeight;
    var alturaDocumento = document.documentElement.scrollHeight;

    var scrollDesejado = scrollAtual + r.top + r.height / 2 - alturaJanela / 2;
    var scrollMaximo = Math.max(0, alturaDocumento - alturaJanela);
    var scrollFinal = Math.max(0, Math.min(scrollDesejado, scrollMaximo));
    var deslocamento = scrollFinal - scrollAtual;

    return {
      top: r.top - deslocamento,
      bottom: r.bottom - deslocamento,
      left: r.left,
      scrollY: scrollFinal,
    };
  }

  // Mesma forma de retângulo, mas sem prever scroll nenhum — usado
  // quando não estamos rolando a página (reposicionar depois que
  // fontes/imagens carregam, ou quando a janela é redimensionada).
  function retanguloAtual(el) {
    var r = el.getBoundingClientRect();
    return {
      top: r.top,
      bottom: r.bottom,
      left: r.left,
      scrollY: window.scrollY || window.pageYOffset,
    };
  }

  function aplicarPosicao(retangulo, semAnimar) {
    if (!retangulo || !elementos.raiz || !elementos.grupo) return;
    if (semAnimar) elementos.raiz.style.transition = "none";
    var scrollX = window.scrollX || window.pageXOffset;
    var gw = elementos.grupo.offsetWidth;
    var gh = elementos.grupo.offsetHeight;
    var margemTopo = 96;
    var margemBase = window.innerHeight - gh - 16;

    // Prioridade 1: logo acima da seção (nunca cobre nada dela).
    // Prioridade 2: logo abaixo dela (também nunca cobre o conteúdo).
    // Se a seção enche a tela inteira (não cabe nem acima nem abaixo
    // dentro da janela), encosta no rodapé da área visível — ali
    // normalmente sobra respiro (botões, fim de texto), nunca o
    // título, que fica lá em cima.
    var acima = retangulo.top - gh - 10;
    var abaixo = retangulo.bottom + 10;
    var topo;
    if (acima >= margemTopo) {
      topo = acima;
    } else if (abaixo <= margemBase) {
      topo = Math.max(margemTopo, abaixo);
    } else {
      topo = margemBase;
    }
    var esquerda = Math.max(12, Math.min(retangulo.left, window.innerWidth - gw - 12));

    elementos.raiz.style.top = topo + retangulo.scrollY + "px";
    elementos.raiz.style.left = esquerda + scrollX + "px";

    if (semAnimar) {
      // força o navegador a aplicar a posição antes de devolver a
      // transição — senão o primeiro passo da página também desliza
      // de (0,0), efeito estranho de "pular do nada".
      void elementos.raiz.offsetHeight;
      elementos.raiz.style.transition = "";
    }
  }

  // A troca de fonte da página (Barlow Condensed/Inter só terminam de
  // carregar depois do primeiro parse) pode empurrar o layout e mudar
  // onde o alvo realmente fica. Mas NUNCA esperamos isso pra posicionar
  // — numa conexão lenta isso podia levar mais de um segundo, e nesse
  // tempo o Remo ficava parado escondido em (0,0) sem aparecer (foi
  // isso que causou o "some no passo 3"). Por isso posicionamos SEMPRE
  // na hora, e só corrigimos de leve depois, se as fontes ainda
  // estiverem carregando quando isso acontece. calcularRetanguloFinal
  // não depende de a página estar parada (a matemática vale mesmo com
  // um scroll nosso em andamento), então recalcular de novo aqui é
  // seguro — diferente de reler a tela "ao vivo", que foi o bug
  // anterior (lia a página no meio do próprio scroll que a gente
  // disparou).
  function corrigirPosicaoQuandoFontesCarregarem(el, indiceDestePasso) {
    if (!document.fonts || !document.fonts.ready || typeof document.fonts.ready.then !== "function") return;
    if (document.fonts.status === "loaded") return;
    document.fonts.ready.then(function () {
      if (!ativo || passoAtual !== indiceDestePasso) return;
      aplicarPosicao(calcularRetanguloFinal(el), true);
    });
  }

  function aoRedimensionar() {
    clearTimeout(timerResize);
    timerResize = setTimeout(function () {
      if (!ativo) return;
      var passo = PASSOS[passoAtual];
      var el = passo && document.querySelector(passo.alvo);
      if (el) aplicarPosicao(retanguloAtual(el));
    }, 200);
  }

  /* ---------------- Passos ---------------- */

  var primeiraExibicaoNestaPagina = true;

  function mostrarPasso(indice) {
    passoAtual = Math.max(0, Math.min(indice, PASSOS.length - 1));
    var indiceDestePasso = passoAtual;
    var passo = PASSOS[passoAtual];
    var semAnimar = primeiraExibicaoNestaPagina;
    primeiraExibicaoNestaPagina = false;

    trocarPose(passo.pose);
    elementos.texto.textContent = passo.texto;
    elementos.contador.textContent = (passoAtual + 1) + " de " + PASSOS.length;
    elementos.anterior.disabled = passoAtual === 0;
    elementos.proximo.textContent = passoAtual === PASSOS.length - 1 ? "Concluir" : "Próximo ›";
    elementos.nav.hidden = false;

    if (passo.acao) {
      elementos.botaoAcao.textContent = passo.acao.rotulo;
      elementos.acaoWrap.hidden = false;
    } else {
      elementos.acaoWrap.hidden = true;
    }

    var el = document.querySelector(passo.alvo);
    if (el) {
      // Calcula ANTES de rolar onde a seção vai parar (matemática pura,
      // não depende de esperar a animação terminar) e já posiciona o
      // Remo lá, na hora — ele nunca fica escondido esperando nada.
      aplicarPosicao(calcularRetanguloFinal(el), semAnimar);
      el.scrollIntoView({ behavior: semAnimar ? "auto" : "smooth", block: "center" });
      corrigirPosicaoQuandoFontesCarregarem(el, indiceDestePasso);
    }

    reiniciarTimer();
  }

  function ir(indice) {
    indice = Math.max(0, Math.min(indice, PASSOS.length - 1));
    var passo = PASSOS[indice];
    salvarEstado(indice);
    if (passo.pagina !== paginaAtual()) {
      location.href = passo.pagina;
      return;
    }
    mostrarPasso(indice);
  }

  function proximo() {
    if (passoAtual >= PASSOS.length - 1) {
      encerrarTour();
      return;
    }
    ir(passoAtual + 1);
  }

  function anterior() {
    ir(passoAtual - 1);
  }

  function executarAcao() {
    var passo = PASSOS[passoAtual];
    if (!passo || !passo.acao) return;
    if (passo.acao.tipo === "agendamento" && window.RemopAgendamento) {
      window.RemopAgendamento.abrir();
    }
  }

  function encerrarTour() {
    ativo = false;
    pararTimer();
    limparEstado();
    document.body.classList.remove("tour-ativo");
    if (elementos.raiz) elementos.raiz.hidden = true;
  }

  function iniciarTour() {
    if (!elementos.raiz) return;
    ativo = true;
    document.body.classList.add("tour-ativo");
    elementos.raiz.hidden = false;
    ir(0);
  }

  window.RemopTour = { iniciar: iniciarTour };

  function montar() {
    var raiz = document.createElement("div");
    raiz.className = "tour-remo";
    raiz.setAttribute("data-tour-remo", "");
    raiz.hidden = true;

    raiz.innerHTML =
      '<button class="tour-remo__pular" type="button" data-tour-pular>Pular tour</button>' +
      '<div class="tour-remo__grupo" data-tour-grupo>' +
      '<img class="tour-remo__mascote" data-tour-imagem src="assets/img/mascote-bemvindo.png" alt="Seu Remo">' +
      '<div class="tour-remo__balao" data-tour-balao>' +
      "<p data-tour-texto></p>" +
      '<div class="tour-remo__acao" data-tour-acao hidden>' +
      '<button type="button" class="botao botao--primario botao--sm" data-tour-botao-acao></button>' +
      "</div>" +
      '<div class="tour-remo__nav" data-tour-nav>' +
      '<span class="tour-remo__contador" data-tour-contador></span>' +
      '<button type="button" class="tour-remo__seta" data-tour-anterior aria-label="Passo anterior">&lsaquo;</button>' +
      '<button type="button" class="botao botao--primario botao--sm" data-tour-proximo>Próximo &rsaquo;</button>' +
      "</div></div></div>";

    document.body.appendChild(raiz);

    elementos = {
      raiz: raiz,
      grupo: raiz.querySelector("[data-tour-grupo]"),
      imagem: raiz.querySelector("[data-tour-imagem]"),
      balao: raiz.querySelector("[data-tour-balao]"),
      texto: raiz.querySelector("[data-tour-texto]"),
      acaoWrap: raiz.querySelector("[data-tour-acao]"),
      botaoAcao: raiz.querySelector("[data-tour-botao-acao]"),
      nav: raiz.querySelector("[data-tour-nav]"),
      contador: raiz.querySelector("[data-tour-contador]"),
      anterior: raiz.querySelector("[data-tour-anterior]"),
      proximo: raiz.querySelector("[data-tour-proximo]"),
    };

    elementos.proximo.addEventListener("click", proximo);
    elementos.anterior.addEventListener("click", anterior);
    elementos.botaoAcao.addEventListener("click", executarAcao);
    raiz.querySelector("[data-tour-pular]").addEventListener("click", encerrarTour);
    raiz.addEventListener("click", reiniciarTimer);
    window.addEventListener("resize", aoRedimensionar);

    // Só retoma nessa página se ela for realmente a página do passo
    // salvo — nunca "adivinha" outro passo (index.html aparece em dois
    // passos diferentes do tour; chutar o mais próximo já causou o
    // Remo pulando pro passo errado). Se o visitante saiu do roteiro
    // sozinho, o tour só reaparece quando ele chegar na página certa
    // de novo (via header, ou clicando Próximo/Anterior).
    var estado = lerEstado();
    if (estado && estado.ativo && PASSOS[estado.passo] && PASSOS[estado.passo].pagina === paginaAtual()) {
      ativo = true;
      document.body.classList.add("tour-ativo");
      raiz.hidden = false;
      mostrarPasso(estado.passo);
    }
  }

  document.addEventListener("DOMContentLoaded", montar);
})();
