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

  function iniciarModalAgendamento() {
    var overlay = document.querySelector("[data-modal-agendamento]");
    if (!overlay) return;

    var abrirBotoes = document.querySelectorAll("[data-abrir-agendamento]");
    var fecharBotoes = overlay.querySelectorAll("[data-fechar-modal]");

    function abrir() {
      overlay.classList.add("aberto");
      document.body.style.overflow = "hidden";
      var primeiroCampo = overlay.querySelector("input, select, textarea");
      if (primeiroCampo) primeiroCampo.focus();
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

  document.addEventListener("DOMContentLoaded", function () {
    preencherLinksWhatsApp();
    iniciarMenuMobile();
    iniciarModalAgendamento();
  });

  window.RemopWhatsApp = { montarLink: montarLinkWhatsApp };
})();
