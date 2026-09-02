/**
 * Comportamento geral do site: menu mobile, links de WhatsApp
 * pré-preenchidos e modal de agendamento de avaliação.
 */
(function () {
  "use strict";

  function montarLinkWhatsApp(mensagem) {
    var config = window.REMOP_CONFIG || {};
    var numero = config.whatsappNumero || "";
    var texto = encodeURIComponent(mensagem || config.whatsappMensagemPadrao || "");
    return "https://wa.me/" + numero + "?text=" + texto;
  }

  function preencherLinksWhatsApp() {
    var links = document.querySelectorAll("[data-whatsapp-mensagem]");
    links.forEach(function (link) {
      var mensagem = link.getAttribute("data-whatsapp-mensagem");
      link.setAttribute("href", montarLinkWhatsApp(mensagem));
    });

    var linksPadrao = document.querySelectorAll("[data-whatsapp-link]");
    linksPadrao.forEach(function (link) {
      link.setAttribute("href", montarLinkWhatsApp());
    });
  }

  function iniciarMenuMobile() {
    var botao = document.querySelector(".menu-toggle");
    var nav = document.querySelector(".nav-principal");
    if (!botao || !nav) return;

    botao.addEventListener("click", function () {
      var aberto = nav.classList.toggle("aberto");
      botao.setAttribute("aria-expanded", aberto ? "true" : "false");
    });

    nav.querySelectorAll("a").forEach(function (link) {
      link.addEventListener("click", function () {
        nav.classList.remove("aberto");
        botao.setAttribute("aria-expanded", "false");
      });
    });
  }

  function configurarModal(overlay, abrirBotoes) {
    if (!overlay || !abrirBotoes.length) return;

    var fecharBotoes = overlay.querySelectorAll("[data-fechar-modal]");

    function abrir() {
      overlay.classList.add("aberto");
      document.body.style.overflow = "hidden";
      var primeiroFoco = overlay.querySelector(
        "input, select, textarea, a:not(.modal__fechar), button:not(.modal__fechar)"
      );
      if (primeiroFoco) primeiroFoco.focus();
    }

    function fechar() {
      overlay.classList.remove("aberto");
      document.body.style.overflow = "";
    }

    abrirBotoes.forEach(function (botao) {
      botao.addEventListener("click", abrir);
    });
    fecharBotoes.forEach(function (botao) {
      botao.addEventListener("click", fechar);
    });
    overlay.addEventListener("click", function (evento) {
      if (evento.target === overlay) fechar();
    });
    document.addEventListener("keydown", function (evento) {
      if (evento.key === "Escape" && overlay.classList.contains("aberto")) fechar();
    });
  }

  function iniciarModais() {
    configurarModal(
      document.querySelector("[data-modal-agendamento]"),
      document.querySelectorAll("[data-abrir-agendamento]")
    );
  }

  /**
   * Faixa de ícones no topo da hero: anda sozinha e também pode ser
   * arrastada com o dedo/mouse (pointer events cobrem os dois). Solta
   * arrastando e ela continua girando com a velocidade do arrasto,
   * desacelerando por atrito até voltar a andar sozinha. Como os
   * ícones aparecem duplicados no HTML (dois conjuntos iguais), a
   * posição é sempre "dobrada" de volta pra dentro de um conjunto,
   * criando a ilusão de loop infinito nos dois sentidos.
   */
  function iniciarFaixaArrastavel() {
    var trilha = document.querySelector(".hero__faixa-trilha");
    if (!trilha) return;

    var reduzMovimento = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches;

    var VELOCIDADE_AUTOMATICA = 0.035; // px por ms
    var ATRITO = 0.94;
    var LIMIAR_CLIQUE = 6; // px — acima disso, não deixa o clique passar pro link

    var larguraConjunto = trilha.scrollWidth / 2;
    window.addEventListener("resize", function () {
      larguraConjunto = trilha.scrollWidth / 2;
    });

    var posicao = 0;
    var arrastando = false;
    var moveuBastante = false;
    var somaMovimento = 0;
    var pontoX = 0;
    var pontoT = 0;
    var velocidade = 0;
    var quadroAtivo = null;
    var ultimoQuadroAuto = null;
    var ultimoQuadroMomento = null;

    function normalizar() {
      if (larguraConjunto <= 0) return;
      while (posicao <= -larguraConjunto) posicao += larguraConjunto;
      while (posicao > 0) posicao -= larguraConjunto;
    }

    function desenhar() {
      normalizar();
      trilha.style.transform = "translateX(" + posicao + "px)";
    }

    function cancelarQuadro() {
      if (quadroAtivo) cancelAnimationFrame(quadroAtivo);
      quadroAtivo = null;
    }

    function autoRolar(agora) {
      if (ultimoQuadroAuto === null) ultimoQuadroAuto = agora;
      var passo = agora - ultimoQuadroAuto;
      ultimoQuadroAuto = agora;
      if (!arrastando && !reduzMovimento) {
        posicao -= VELOCIDADE_AUTOMATICA * passo;
        desenhar();
      }
      quadroAtivo = requestAnimationFrame(autoRolar);
    }

    function aplicarMomento(agora) {
      if (ultimoQuadroMomento === null) ultimoQuadroMomento = agora;
      var passo = agora - ultimoQuadroMomento;
      ultimoQuadroMomento = agora;
      posicao += velocidade * passo;
      velocidade *= ATRITO;
      desenhar();
      if (Math.abs(velocidade) > 0.01) {
        quadroAtivo = requestAnimationFrame(aplicarMomento);
      } else {
        ultimoQuadroMomento = null;
        ultimoQuadroAuto = null;
        quadroAtivo = requestAnimationFrame(autoRolar);
      }
    }

    function aoPressionar(evento) {
      arrastando = true;
      moveuBastante = false;
      somaMovimento = 0;
      cancelarQuadro();
      pontoX = evento.clientX;
      pontoT = performance.now();
      velocidade = 0;
      trilha.classList.add("arrastando");
      if (trilha.setPointerCapture) {
        try {
          trilha.setPointerCapture(evento.pointerId);
        } catch (erro) {}
      }
    }

    function aoMover(evento) {
      if (!arrastando) return;
      var agora = performance.now();
      var deltaX = evento.clientX - pontoX;
      var deltaT = Math.max(agora - pontoT, 1);
      posicao += deltaX;
      velocidade = deltaX / deltaT;
      somaMovimento += Math.abs(deltaX);
      if (somaMovimento > LIMIAR_CLIQUE) moveuBastante = true;
      pontoX = evento.clientX;
      pontoT = agora;
      desenhar();
    }

    function aoSoltar() {
      if (!arrastando) return;
      arrastando = false;
      trilha.classList.remove("arrastando");
      cancelarQuadro();
      ultimoQuadroMomento = null;
      if (Math.abs(velocidade) > 0.02 && !reduzMovimento) {
        quadroAtivo = requestAnimationFrame(aplicarMomento);
      } else {
        ultimoQuadroAuto = null;
        quadroAtivo = requestAnimationFrame(autoRolar);
      }
    }

    trilha.addEventListener("pointerdown", aoPressionar);
    trilha.addEventListener("pointermove", aoMover);
    trilha.addEventListener("pointerup", aoSoltar);
    trilha.addEventListener("pointercancel", aoSoltar);
    trilha.addEventListener("pointerleave", function (evento) {
      if (arrastando && evento.buttons === 0) aoSoltar();
    });
    // Depois de um arrasto de verdade, o clique que sobra não deve
    // abrir o link do ícone — só some quando foi mesmo um toque.
    trilha.addEventListener(
      "click",
      function (evento) {
        if (moveuBastante) {
          evento.preventDefault();
          evento.stopPropagation();
        }
      },
      true
    );

    quadroAtivo = requestAnimationFrame(autoRolar);
  }

  /**
   * Facilidades (Banheiros, Estacionamento, etc.) em institucional.html:
   * clica e abre uma descrição embaixo; clicar em outro item fecha o
   * anterior automaticamente (só um aberto por vez).
   */
  function iniciarAcordeaoFacilidades() {
    var lista = document.querySelector("[data-acordeao-facilidades]");
    if (!lista) return;

    var cabecalhos = lista.querySelectorAll(".facilidade__cabecalho");

    cabecalhos.forEach(function (cabecalho) {
      var detalhe = cabecalho.nextElementSibling;

      cabecalho.addEventListener("click", function () {
        var jaAberto = cabecalho.getAttribute("aria-expanded") === "true";

        cabecalhos.forEach(function (outro) {
          outro.setAttribute("aria-expanded", "false");
          outro.nextElementSibling.hidden = true;
        });

        if (!jaAberto) {
          cabecalho.setAttribute("aria-expanded", "true");
          detalhe.hidden = false;
        }
      });
    });
  }

  document.addEventListener("DOMContentLoaded", function () {
    preencherLinksWhatsApp();
    iniciarMenuMobile();
    iniciarModais();
    iniciarFaixaArrastavel();
    iniciarAcordeaoFacilidades();
  });

  window.RemopWhatsApp = { montarLink: montarLinkWhatsApp };
})();
