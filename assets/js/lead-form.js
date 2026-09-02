/**
 * Formulário de agendamento de avaliação.
 * Salva o lead no Firestore (coleção "agendamentos") quando o Firebase
 * está configurado; sempre oferece o fallback direto pro WhatsApp.
 */
(function () {
  "use strict";

  function exibirStatus(elemento, mensagem, tipo) {
    elemento.textContent = mensagem;
    elemento.className = "mensagem-status mensagem-status--" + tipo;
  }

  function montarMensagemWhatsApp(dados) {
    return (
      "Olá! Gostaria de agendar uma avaliação.\n" +
      "Nome: " + dados.nome + "\n" +
      "Telefone: " + dados.telefone + "\n" +
      "Serviço de interesse: " + dados.servico + "\n" +
      (dados.mensagem ? "Detalhes: " + dados.mensagem : "")
    );
  }

  async function salvarNoFirestore(dados) {
    var firebaseInfo = window.RemopFirebase;
    if (!firebaseInfo || !firebaseInfo.pronto) return false;

    await firebaseInfo.db.collection("agendamentos").add({
      nome: dados.nome,
      telefone: dados.telefone,
      servico: dados.servico,
      mensagem: dados.mensagem || "",
      origem: "site",
      status: "novo",
      criadoEm: firebase.firestore.FieldValue.serverTimestamp(),
    });
    return true;
  }

  function iniciarFormulario() {
    var formulario = document.querySelector("[data-form-agendamento]");
    if (!formulario) return;

    var statusEl = formulario.querySelector("[data-status-agendamento]");

    formulario.addEventListener("submit", async function (evento) {
      evento.preventDefault();

      var dados = {
        nome: formulario.nome.value.trim(),
        telefone: formulario.telefone.value.trim(),
        servico: formulario.servico.value,
        mensagem: formulario.mensagem.value.trim(),
      };

      if (!dados.nome || !dados.telefone) {
        exibirStatus(statusEl, "Preencha nome e telefone para continuar.", "erro");
        return;
      }

      var botaoEnviar = formulario.querySelector('[type="submit"]');
      if (botaoEnviar) botaoEnviar.disabled = true;

      try {
        var salvou = await salvarNoFirestore(dados);
        exibirStatus(
          statusEl,
          salvou
            ? "Recebemos seu pedido! Agora finalize direto no WhatsApp pra confirmar o horário."
            : "Certo! Finalize o pedido direto no WhatsApp pra confirmar o horário.",
          "sucesso"
        );
      } catch (erro) {
        console.error("[Remop] Falha ao salvar agendamento no Firestore:", erro);
        exibirStatus(
          statusEl,
          "Não conseguimos salvar automaticamente, mas você pode continuar direto no WhatsApp.",
          "erro"
        );
      } finally {
        if (botaoEnviar) botaoEnviar.disabled = false;
      }

      var link = window.RemopWhatsApp.montarLink(montarMensagemWhatsApp(dados));
      window.open(link, "_blank", "noopener");
    });
  }

  document.addEventListener("DOMContentLoaded", iniciarFormulario);
})();
