/**
 * Formulário de agendamento de avaliação.
 * Salva o lead no Supabase (tabela "agendamentos") quando está
 * configurado; sempre oferece o fallback direto pro WhatsApp.
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

  async function salvarNoSupabase(dados) {
    var supabaseInfo = window.RemopSupabase;
    if (!supabaseInfo || !supabaseInfo.pronto) return false;

    var resultado = await supabaseInfo.client.from("agendamentos").insert({
      nome: dados.nome,
      telefone: dados.telefone,
      servico: dados.servico,
      mensagem: dados.mensagem || "",
      origem: "site",
      status: "novo",
      pagina: location.pathname,
    });
    if (resultado.error) throw resultado.error;
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
        var salvou = await salvarNoSupabase(dados);
        exibirStatus(
          statusEl,
          salvou
            ? "Recebemos seu pedido! Agora finalize direto no WhatsApp pra confirmar o horário."
            : "Certo! Finalize o pedido direto no WhatsApp pra confirmar o horário.",
          "sucesso"
        );
      } catch (erro) {
        console.error("[Remop] Falha ao salvar agendamento no Supabase:", erro);
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
