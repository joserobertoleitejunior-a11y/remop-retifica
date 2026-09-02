/**
 * Portão de entrada: pede nome, WhatsApp, modelo e ano do carro antes
 * de liberar o site, e salva no Firestore (coleção "visitantes") pra
 * virar base de clientes / dashboard no futuro.
 *
 * Uma vez preenchido, o navegador lembra (localStorage) e não pede de
 * novo. Quem clicar em "pular" também não vê o portão de novo nesta
 * mesma sessão do navegador (sessionStorage), mas pode ser perguntado
 * de novo numa visita futura.
 */
(function () {
  "use strict";

  var CHAVE_REGISTRADO = "remopVisitanteRegistrado";
  var CHAVE_PULOU = "remopVisitantePulouPortao";
  var CHAVE_NOME = "remopVisitanteNome";
  var CHAVE_WHATSAPP = "remopVisitanteWhatsapp";
  var CHAVE_CARRO = "remopVisitanteCarro";

  /**
   * Identidade do visitante compartilhada entre o portão e o bot —
   * assim o bot não pergunta nome/WhatsApp de novo se a pessoa já
   * preencheu o portão.
   */
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
    var firebaseInfo = window.RemopFirebase;
    if (!firebaseInfo || !firebaseInfo.pronto) return false;

    await firebaseInfo.db.collection("visitantes").add({
      nome: dados.nome,
      whatsapp: dados.whatsapp,
      modeloCarro: dados.modelo || "",
      anoCarro: dados.ano || "",
      origem: "portao-entrada",
      criadoEm: firebase.firestore.FieldValue.serverTimestamp(),
    });
    return true;
  }

  function iniciar() {
    var portao = document.querySelector("[data-portao-visitante]");
    if (!portao) return;

    if (jaPassouPeloPortao()) return;

    portao.hidden = false;
    travarScroll(true);

    var formulario = portao.querySelector("[data-form-portao]");
    var statusEl = portao.querySelector("[data-status-portao]");
    var botaoPular = portao.querySelector("[data-pular-portao]");

    function fecharPortao() {
      portao.hidden = true;
      travarScroll(false);
    }

    botaoPular.addEventListener("click", function () {
      try {
        sessionStorage.setItem(CHAVE_PULOU, "1");
      } catch (erro) {
        /* armazenamento bloqueado — só fecha mesmo assim */
      }
      fecharPortao();
    });

    formulario.addEventListener("submit", async function (evento) {
      evento.preventDefault();

      var dados = {
        nome: formulario.nome.value.trim(),
        whatsapp: formulario.whatsapp.value.trim(),
        modelo: formulario.modelo.value.trim(),
        ano: formulario.ano.value.trim(),
      };

      if (!dados.nome || !dados.whatsapp) {
        statusEl.textContent = "Preenche nome e WhatsApp pra continuar.";
        statusEl.className = "mensagem-status mensagem-status--erro";
        return;
      }

      var botaoEnviar = formulario.querySelector('[type="submit"]');
      botaoEnviar.disabled = true;

      try {
        await salvarVisitante(dados);
      } catch (erro) {
        console.warn("[Remop] Não deu pra salvar o visitante agora:", erro);
      }

      window.RemopIdentidade.salvar({
        nome: dados.nome,
        whatsapp: dados.whatsapp,
        carro: [dados.modelo, dados.ano].filter(Boolean).join(" "),
      });

      try {
        localStorage.setItem(CHAVE_REGISTRADO, "1");
      } catch (erro) {
        /* sem storage — segue o baile, só não vai lembrar da próxima vez */
      }

      botaoEnviar.disabled = false;
      fecharPortao();
    });
  }

  document.addEventListener("DOMContentLoaded", iniciar);
})();
