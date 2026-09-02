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
    iniciarAcordeaoFacilidades();
  });

  window.RemopWhatsApp = { montarLink: montarLinkWhatsApp };
})();
