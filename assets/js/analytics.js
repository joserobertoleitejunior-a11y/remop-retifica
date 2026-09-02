/**
 * Rastreamento leve de uso do site — visitas por página, cliques nos
 * principais CTAs e perguntas feitas ao bot. Alimenta o futuro painel
 * administrativo (dashboard).
 *
 * Só grava quando o Firebase estiver configurado (mesmo padrão do resto
 * do site — ver firebase-init.js); se não estiver, não faz nada e nunca
 * trava a navegação por causa disso.
 */
(function () {
  "use strict";

  var CHAVE_VISITANTE_ID = "remopVisitanteId";

  function obterVisitanteId() {
    try {
      var id = localStorage.getItem(CHAVE_VISITANTE_ID);
      if (!id) {
        id = "v-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8);
        localStorage.setItem(CHAVE_VISITANTE_ID, id);
      }
      return id;
    } catch (erro) {
      return null;
    }
  }

  async function registrar(colecao, dados) {
    var firebaseInfo = window.RemopFirebase;
    if (!firebaseInfo || !firebaseInfo.pronto) return;

    try {
      await firebaseInfo.db.collection(colecao).add(
        Object.assign(
          {
            pagina: location.pathname,
            visitanteId: obterVisitanteId(),
            criadoEm: firebase.firestore.FieldValue.serverTimestamp(),
          },
          dados
        )
      );
    } catch (erro) {
      console.warn("[Remop] Não deu pra registrar analytics (" + colecao + "):", erro);
    }
  }

  function registrarPagina() {
    registrar("paginas_vistas", { referencia: document.referrer || "" });
  }

  function registrarCliques() {
    var seletores =
      "[data-whatsapp-link], [data-whatsapp-mensagem], [data-abrir-agendamento], [data-chat-abrir], [data-consultar-servico]";

    document.addEventListener("click", function (evento) {
      var alvo = evento.target.closest(seletores);
      if (!alvo) return;

      var tipo = alvo.hasAttribute("data-consultar-servico")
        ? "consultar-servico"
        : alvo.hasAttribute("data-chat-abrir")
        ? "abrir-chat"
        : alvo.hasAttribute("data-abrir-agendamento")
        ? "abrir-agendamento"
        : "whatsapp";

      registrar("cliques", {
        tipo: tipo,
        detalhe:
          alvo.getAttribute("data-consultar-servico") ||
          alvo.textContent.trim().slice(0, 60),
      });
    });
  }

  window.RemopAnalytics = {
    registrarPergunta: function (texto) {
      registrar("perguntas_ia", { texto: String(texto || "").slice(0, 500) });
    },
  };

  document.addEventListener("DOMContentLoaded", function () {
    registrarPagina();
    registrarCliques();
  });
})();
