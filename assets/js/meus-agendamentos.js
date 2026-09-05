/**
 * Autoatendimento por telefone — o cliente digita o próprio WhatsApp e
 * vê/cancela os agendamentos que fez. Decisão explícita do dono do
 * negócio: o número funciona como uma senha curta, sem verificação por
 * SMS (custaria contratar um serviço de envio). A segurança de verdade
 * mora no banco: as funções buscar_agendamentos_por_telefone e
 * cancelar_agendamento_por_telefone (Supabase, SECURITY DEFINER) são as
 * únicas que sabem filtrar por telefone — este arquivo nunca consulta a
 * tabela agendamentos diretamente, então não tem como puxar a lista
 * inteira mesmo se alguém adulterar essa página no navegador.
 */
(function () {
  "use strict";

  var ROTULOS_STATUS = {
    novo: "Recebido, aguardando confirmação",
    confirmado: "Confirmado",
    atendido: "Já atendido",
    cancelado: "Cancelado",
  };

  var elementos = {};
  var telefoneAtual = "";

  function cliente() {
    return window.RemopSupabase.client;
  }

  function exibirStatus(mensagem, tipo) {
    elementos.status.textContent = mensagem;
    elementos.status.className = "mensagem-status" + (tipo ? " mensagem-status--" + tipo : "");
  }

  function formatarData(valor) {
    return valor
      ? new Date(valor).toLocaleString("pt-BR", {
          day: "2-digit",
          month: "2-digit",
          year: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        })
      : "–";
  }

  function renderizarLista(linhas) {
    var lista = elementos.lista;
    lista.innerHTML = "";
    lista.hidden = false;
    elementos.blocoNovo.hidden = false;

    if (!linhas.length) {
      var vazio = document.createElement("p");
      vazio.className = "meus-agendamentos__vazio";
      vazio.textContent = "Não encontramos nenhum agendamento com esse número.";
      lista.appendChild(vazio);
      return;
    }

    linhas.forEach(function (linha) {
      var item = document.createElement("div");
      item.className = "meus-agendamentos__item";

      var cabecalho = document.createElement("div");
      cabecalho.className = "meus-agendamentos__item-cabecalho";

      var servico = document.createElement("strong");
      servico.textContent = linha.servico || "Avaliação geral";
      cabecalho.appendChild(servico);

      var status = document.createElement("span");
      var chaveStatus = linha.status || "novo";
      status.className = "meus-agendamentos__status meus-agendamentos__status--" + chaveStatus;
      status.textContent = ROTULOS_STATUS[chaveStatus] || chaveStatus;
      cabecalho.appendChild(status);

      item.appendChild(cabecalho);

      var data = document.createElement("p");
      data.className = "meus-agendamentos__data";
      data.textContent = "Pedido em " + formatarData(linha.criado_em);
      item.appendChild(data);

      if (linha.mensagem) {
        var mensagem = document.createElement("p");
        mensagem.className = "meus-agendamentos__mensagem";
        mensagem.textContent = "“" + linha.mensagem + "”";
        item.appendChild(mensagem);
      }

      if (chaveStatus !== "cancelado" && chaveStatus !== "atendido") {
        var botaoCancelar = document.createElement("button");
        botaoCancelar.type = "button";
        botaoCancelar.className = "botao botao--outline botao--sm";
        botaoCancelar.textContent = "Desmarcar";
        botaoCancelar.addEventListener("click", function () {
          desmarcar(linha.id, botaoCancelar);
        });
        item.appendChild(botaoCancelar);
      }

      lista.appendChild(item);
    });
  }

  async function desmarcar(id, botao) {
    if (!window.confirm("Tem certeza que quer desmarcar esse agendamento?")) return;
    botao.disabled = true;
    try {
      var resultado = await cliente().rpc("cancelar_agendamento_por_telefone", {
        p_id: id,
        p_telefone: telefoneAtual,
      });
      if (resultado.error) throw resultado.error;
      if (!resultado.data) {
        exibirStatus("Não foi possível desmarcar — busque de novo e tente outra vez.", "erro");
        botao.disabled = false;
        return;
      }
      exibirStatus("Agendamento desmarcado.", "sucesso");
      await buscar(telefoneAtual);
    } catch (erro) {
      console.error("[Remop] Falha ao desmarcar agendamento:", erro);
      exibirStatus("Não foi possível desmarcar agora. Tente de novo em instantes.", "erro");
      botao.disabled = false;
    }
  }

  async function buscar(telefone) {
    exibirStatus("Buscando...", "");
    try {
      var resultado = await cliente().rpc("buscar_agendamentos_por_telefone", { p_telefone: telefone });
      if (resultado.error) throw resultado.error;
      telefoneAtual = telefone;
      renderizarLista(resultado.data || []);
      exibirStatus("", "");
    } catch (erro) {
      console.error("[Remop] Falha ao buscar agendamentos:", erro);
      exibirStatus("Não foi possível buscar agora. Tente de novo em instantes.", "erro");
    }
  }

  function iniciar() {
    elementos = {
      form: document.querySelector("[data-form-buscar]"),
      status: document.querySelector("[data-status-busca]"),
      lista: document.querySelector("[data-lista-agendamentos]"),
      blocoNovo: document.querySelector("[data-bloco-novo]"),
    };

    if (!elementos.form) return;

    if (!window.RemopSupabase || !window.RemopSupabase.pronto) {
      exibirStatus("Consulta indisponível no momento — fale direto pelo WhatsApp.", "erro");
      elementos.form.querySelector('[type="submit"]').disabled = true;
      return;
    }

    elementos.form.addEventListener("submit", function (evento) {
      evento.preventDefault();
      var telefone = elementos.form.telefone.value.trim();
      if (!telefone) {
        exibirStatus("Digite o número do WhatsApp.", "erro");
        return;
      }
      buscar(telefone);
    });
  }

  document.addEventListener("DOMContentLoaded", iniciar);
})();
