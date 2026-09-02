/**
 * Rastreamento leve de uso do site — visitas por página, cliques nos
 * principais CTAs e perguntas feitas ao bot. Alimenta o painel
 * administrativo (dashboard).
 *
 * Só grava quando o Supabase estiver configurado (mesmo padrão do resto
 * do site — ver supabase-init.js); se não estiver, não faz nada e nunca
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

  async function registrar(tabela, dados) {
    var supabaseInfo = window.RemopSupabase;
    if (!supabaseInfo || !supabaseInfo.pronto) return;

    try {
      var linha = Object.assign(
        {
          pagina: location.pathname,
          visitante_id: obterVisitanteId(),
        },
        dados
      );
      var resultado = await supabaseInfo.client.from(tabela).insert(linha);
      if (resultado.error) throw resultado.error;
    } catch (erro) {
      console.warn("[Remop] Não deu pra registrar analytics (" + tabela + "):", erro);
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
