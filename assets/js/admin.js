/**
 * Painel administrativo — login por PIN (Supabase Auth por baixo dos
 * panos) + dashboard (Chart.js) + Clientes + Galeria + Assistente IA,
 * com dados reais das tabelas que assets/js/analytics.js,
 * visitor-gate.js, lead-form.js e o próprio painel gravam no Supabase.
 *
 * Login por PIN: o Supabase Auth continua sendo o mecanismo real por
 * trás (é o que autoriza a leitura protegida pelas políticas de RLS),
 * mas a equipe só digita um PIN numérico curto — o painel completa
 * esse PIN com um sufixo fixo antes de mandar pro Supabase, porque o
 * Supabase exige senha de pelo menos 6 caracteres. Ver README.md pra
 * saber qual e-mail/senha cadastrar no Supabase.
 *
 * Pré-requisito (feito uma vez, fora do código): criar esse usuário no
 * Supabase (Authentication → Users → Add user), rodar o schema SQL e
 * as políticas de RLS/Storage (ver README.md).
 */
(function () {
  "use strict";

  var PAINEL_EMAIL_FIXO = "painel@remop-retifica.internal";
  var SUFIXO_SENHA_PIN = "-RemopPainel2026!";
  var BUCKET_GALERIA = "galeria";

  var CORES = {
    visitantes: "#1E2E63",
    agendamentos: "#1f8a4c",
    cliques: "#D9A916",
    perguntas: "#c0392b",
  };

  var ROTULOS_PAGINA = {
    "/": "Home",
    "/index.html": "Home",
    "/institucional.html": "Institucional",
    "/localizacao.html": "Localização",
  };

  var elementos = {};
  var grafico = null;
  var seriesAtivas = { visitantes: true, agendamentos: true, cliques: true, perguntas: true };
  var secoesCarregadas = {};

  function cliente() {
    return window.RemopSupabase.client;
  }

  function rotuloPagina(caminho) {
    if (!caminho) return "–";
    var limpo = caminho.split("?")[0];
    return ROTULOS_PAGINA[limpo] || limpo;
  }

  function formatarDataCurta(data) {
    return data.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
  }

  function formatarDataHora(valor) {
    return valor ? new Date(valor).toLocaleString("pt-BR") : "–";
  }

  function gerarFaixaDeDias(quantidade) {
    var dias = [];
    var hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    for (var i = quantidade - 1; i >= 0; i--) {
      var dia = new Date(hoje);
      dia.setDate(dia.getDate() - i);
      dias.push(dia);
    }
    return dias;
  }

  async function buscarTabela(tabela, desde) {
    var query = cliente().from(tabela).select("*");
    if (desde) query = query.gte("criado_em", desde.toISOString());
    var resultado = await query;
    if (resultado.error) throw resultado.error;
    return resultado.data || [];
  }

  function ordenarPorDataDesc(linhas) {
    return linhas.slice().sort(function (a, b) {
      var ta = a.criado_em ? new Date(a.criado_em).getTime() : 0;
      var tb = b.criado_em ? new Date(b.criado_em).getTime() : 0;
      return tb - ta;
    });
  }

  function contarPorDia(linhas, dias) {
    var contagem = dias.map(function () { return 0; });
    linhas.forEach(function (linha) {
      if (!linha.criado_em) return;
      var data = new Date(linha.criado_em);
      data.setHours(0, 0, 0, 0);
      dias.forEach(function (dia, indice) {
        if (data.getTime() === dia.getTime()) contagem[indice]++;
      });
    });
    return contagem;
  }

  // ---------------------------------------------------------------------
  // Navegação por abas
  // ---------------------------------------------------------------------
  function secaoAtualDoHash() {
    var hash = (location.hash || "#dashboard").replace("#", "");
    var valida = elementos.painel.querySelector('[data-secao="' + hash + '"]');
    return valida ? hash : "dashboard";
  }

  function mostrarSecao(nome) {
    elementos.painel.querySelectorAll("[data-secao]").forEach(function (secao) {
      secao.hidden = secao.getAttribute("data-secao") !== nome;
    });
    elementos.painel.querySelectorAll("[data-secao-link]").forEach(function (link) {
      var ativo = link.getAttribute("data-secao-link") === nome;
      if (ativo) link.setAttribute("aria-current", "page");
      else link.removeAttribute("aria-current");
    });

    if (!secoesCarregadas[nome]) {
      secoesCarregadas[nome] = true;
      if (nome === "clientes") carregarClientes();
      if (nome === "galeria") carregarGaleria();
      if (nome === "assistente") carregarAssistente();
    }
  }

  function iniciarNavegacao() {
    elementos.painel.querySelectorAll("[data-secao-link]").forEach(function (link) {
      link.addEventListener("click", function (evento) {
        evento.preventDefault();
        var nome = link.getAttribute("data-secao-link");
        location.hash = nome;
        mostrarSecao(nome);
      });
    });
    window.addEventListener("hashchange", function () {
      mostrarSecao(secaoAtualDoHash());
    });
  }

  // ---------------------------------------------------------------------
  // Dashboard
  // ---------------------------------------------------------------------
  function atualizarStats(totais) {
    Object.keys(totais).forEach(function (chave) {
      var el = elementos.painel.querySelector('[data-stat="' + chave + '"]');
      if (el) el.textContent = totais[chave];
    });
  }

  function montarGrafico(dias, series) {
    var rotulos = dias.map(formatarDataCurta);
    var datasets = [
      { chave: "visitantes", label: "Visitantes" },
      { chave: "agendamentos", label: "Agendamentos" },
      { chave: "cliques", label: "Cliques" },
      { chave: "perguntas", label: "Perguntas IA" },
    ].map(function (item) {
      return {
        label: item.label,
        data: series[item.chave],
        borderColor: CORES[item.chave],
        backgroundColor: CORES[item.chave],
        tension: 0.3,
        hidden: !seriesAtivas[item.chave],
        _chave: item.chave,
      };
    });

    if (grafico) grafico.destroy();
    grafico = new Chart(elementos.canvas.getContext("2d"), {
      type: "line",
      data: { labels: rotulos, datasets: datasets },
      options: {
        responsive: true,
        plugins: { legend: { display: false } },
        scales: { y: { beginAtZero: true, ticks: { precision: 0 } } },
      },
    });
  }

  function preencherTabelaPerguntas(linhas) {
    var corpo = elementos.painel.querySelector("[data-tabela-perguntas] tbody");
    corpo.innerHTML = "";

    ordenarPorDataDesc(linhas)
      .slice(0, 25)
      .forEach(function (linha) {
        var tr = document.createElement("tr");
        [formatarDataHora(linha.criado_em), rotuloPagina(linha.pagina), linha.texto || ""].forEach(function (texto) {
          var td = document.createElement("td");
          td.textContent = texto;
          tr.appendChild(td);
        });
        corpo.appendChild(tr);
      });
  }

  function preencherCliquesPorPagina(linhas) {
    var corpo = elementos.painel.querySelector("[data-tabela-cliques-pagina] tbody");
    corpo.innerHTML = "";

    var contagem = {};
    linhas.forEach(function (linha) {
      var chave = rotuloPagina(linha.pagina);
      contagem[chave] = (contagem[chave] || 0) + 1;
    });

    var itens = Object.keys(contagem)
      .map(function (pagina) { return { pagina: pagina, total: contagem[pagina] }; })
      .sort(function (a, b) { return b.total - a.total; });

    if (!itens.length) {
      var trVazia = document.createElement("tr");
      var tdVazia = document.createElement("td");
      tdVazia.colSpan = 2;
      tdVazia.textContent = "Nenhum clique registrado no período.";
      trVazia.appendChild(tdVazia);
      corpo.appendChild(trVazia);
      return;
    }

    itens.forEach(function (item) {
      var tr = document.createElement("tr");
      var tdPagina = document.createElement("td");
      tdPagina.textContent = item.pagina;
      var tdTotal = document.createElement("td");
      tdTotal.textContent = item.total;
      tr.appendChild(tdPagina);
      tr.appendChild(tdTotal);
      corpo.appendChild(tr);
    });
  }

  async function carregarDados() {
    var periodoDias = parseInt(elementos.periodo.value, 10) || 30;
    var dias = gerarFaixaDeDias(periodoDias);
    var desde = dias[0];

    var resultados = await Promise.all([
      buscarTabela("visitantes", desde),
      buscarTabela("agendamentos", desde),
      buscarTabela("cliques", desde),
      buscarTabela("perguntas_ia", desde),
    ]);
    var visitantes = resultados[0];
    var agendamentos = resultados[1];
    var cliques = resultados[2];
    var perguntas = resultados[3];

    atualizarStats({
      visitantes: visitantes.length,
      agendamentos: agendamentos.length,
      cliques: cliques.length,
      perguntas: perguntas.length,
    });

    montarGrafico(dias, {
      visitantes: contarPorDia(visitantes, dias),
      agendamentos: contarPorDia(agendamentos, dias),
      cliques: contarPorDia(cliques, dias),
      perguntas: contarPorDia(perguntas, dias),
    });

    preencherTabelaPerguntas(perguntas);
    preencherCliquesPorPagina(cliques);
  }

  function iniciarToggles() {
    elementos.painel.querySelectorAll("[data-toggle-serie]").forEach(function (botao) {
      botao.addEventListener("click", function () {
        var chave = botao.getAttribute("data-toggle-serie");
        seriesAtivas[chave] = !seriesAtivas[chave];
        botao.classList.toggle("admin-toggle--ativo", seriesAtivas[chave]);

        if (!grafico) return;
        var dataset = grafico.data.datasets.filter(function (d) { return d._chave === chave; })[0];
        if (dataset) {
          dataset.hidden = !seriesAtivas[chave];
          grafico.update();
        }
      });
    });
  }

  // ---------------------------------------------------------------------
  // Clientes
  // ---------------------------------------------------------------------
  var clientesCache = { agendamentos: [], visitantes: [] };

  function linhaTabela(celulas) {
    var tr = document.createElement("tr");
    celulas.forEach(function (texto) {
      var td = document.createElement("td");
      td.textContent = texto;
      tr.appendChild(td);
    });
    return tr;
  }

  function renderizarClientes(filtro) {
    filtro = (filtro || "").trim().toLowerCase();

    var corpoAgendamentos = elementos.painel.querySelector("[data-tabela-agendamentos] tbody");
    corpoAgendamentos.innerHTML = "";
    ordenarPorDataDesc(clientesCache.agendamentos)
      .filter(function (linha) { return !filtro || (linha.nome || "").toLowerCase().indexOf(filtro) !== -1; })
      .forEach(function (linha) {
        corpoAgendamentos.appendChild(
          linhaTabela([
            formatarDataHora(linha.criado_em),
            linha.nome || "–",
            linha.telefone || "–",
            linha.servico || "–",
            linha.mensagem || "–",
            linha.status || "novo",
          ])
        );
      });

    var corpoVisitantes = elementos.painel.querySelector("[data-tabela-visitantes] tbody");
    corpoVisitantes.innerHTML = "";
    ordenarPorDataDesc(clientesCache.visitantes)
      .filter(function (linha) { return !filtro || (linha.nome || "").toLowerCase().indexOf(filtro) !== -1; })
      .forEach(function (linha) {
        corpoVisitantes.appendChild(
          linhaTabela([
            formatarDataHora(linha.criado_em),
            linha.nome || "–",
            linha.whatsapp || "–",
            linha.modelo_carro || "–",
            linha.ano_carro || "–",
            rotuloPagina(linha.pagina),
          ])
        );
      });
  }

  async function carregarClientes() {
    try {
      var resultados = await Promise.all([
        buscarTabela("agendamentos", null),
        buscarTabela("visitantes", null),
      ]);
      clientesCache.agendamentos = resultados[0];
      clientesCache.visitantes = resultados[1];
      renderizarClientes(elementos.filtroClientes.value);
    } catch (erro) {
      console.error("[Remop Admin] Falha ao carregar clientes:", erro);
    }
  }

  function iniciarFiltroClientes() {
    elementos.filtroClientes.addEventListener("input", function () {
      renderizarClientes(elementos.filtroClientes.value);
    });
  }

  // ---------------------------------------------------------------------
  // Galeria
  // ---------------------------------------------------------------------
  function exibirStatus(elemento, mensagem, tipo) {
    elemento.textContent = mensagem;
    elemento.className = "mensagem-status" + (tipo ? " mensagem-status--" + tipo : "");
  }

  function renderizarGaleria(fotos) {
    var grade = elementos.galeriaGrid;
    grade.innerHTML = "";

    if (!fotos.length) {
      var vazio = document.createElement("p");
      vazio.className = "admin-texto-apoio";
      vazio.textContent = "Nenhuma foto adicionada ainda.";
      grade.appendChild(vazio);
      return;
    }

    fotos
      .slice()
      .sort(function (a, b) { return (a.ordem || 0) - (b.ordem || 0); })
      .forEach(function (foto) {
        var item = document.createElement("div");
        item.className = "admin-galeria-item";

        var img = document.createElement("img");
        img.src = foto.url;
        img.alt = foto.alt || "";
        item.appendChild(img);

        var legenda = document.createElement("p");
        legenda.textContent = foto.alt || "(sem descrição)";
        item.appendChild(legenda);

        var remover = document.createElement("button");
        remover.type = "button";
        remover.className = "botao botao--outline botao--sm";
        remover.textContent = "Remover";
        remover.addEventListener("click", function () { removerFotoGaleria(foto); });
        item.appendChild(remover);

        grade.appendChild(item);
      });
  }

  async function carregarGaleria() {
    try {
      var fotos = await buscarTabela("galeria", null);
      renderizarGaleria(fotos);
    } catch (erro) {
      console.error("[Remop Admin] Falha ao carregar a galeria:", erro);
    }
  }

  async function removerFotoGaleria(foto) {
    if (!window.confirm('Remover a foto "' + (foto.alt || foto.id) + '"?')) return;
    try {
      if (foto.storage_path) {
        await cliente().storage.from(BUCKET_GALERIA).remove([foto.storage_path]);
      }
      var resultado = await cliente().from("galeria").delete().eq("id", foto.id);
      if (resultado.error) throw resultado.error;
      carregarGaleria();
    } catch (erro) {
      console.error("[Remop Admin] Falha ao remover foto:", erro);
      window.alert("Não foi possível remover essa foto agora.");
    }
  }

  async function enviarFotoGaleria(evento) {
    evento.preventDefault();
    var formulario = evento.target;
    var arquivo = formulario.arquivo.files[0];
    var alt = formulario.alt.value.trim();
    var statusEl = elementos.painel.querySelector("[data-status-galeria]");

    if (!arquivo || !alt) {
      exibirStatus(statusEl, "Escolha um arquivo e escreva uma descrição.", "erro");
      return;
    }

    var botaoEnviar = formulario.querySelector('[type="submit"]');
    botaoEnviar.disabled = true;
    exibirStatus(statusEl, "Enviando foto...", "");

    try {
      var caminho = Date.now() + "-" + arquivo.name.replace(/[^a-zA-Z0-9.\-_]/g, "-");

      var envio = await cliente().storage.from(BUCKET_GALERIA).upload(caminho, arquivo);
      if (envio.error) throw envio.error;

      var publica = cliente().storage.from(BUCKET_GALERIA).getPublicUrl(caminho);
      var url = publica.data.publicUrl;

      var existentes = await buscarTabela("galeria", null);
      var proximaOrdem = existentes.reduce(function (max, item) { return Math.max(max, item.ordem || 0); }, 0) + 1;

      var insercao = await cliente().from("galeria").insert({
        url: url,
        alt: alt,
        ordem: proximaOrdem,
        storage_path: caminho,
      });
      if (insercao.error) throw insercao.error;

      exibirStatus(statusEl, "Foto adicionada!", "sucesso");
      formulario.reset();
      carregarGaleria();
    } catch (erro) {
      console.error("[Remop Admin] Falha ao enviar foto:", erro);
      exibirStatus(statusEl, "Não foi possível enviar essa foto agora.", "erro");
    } finally {
      botaoEnviar.disabled = false;
    }
  }

  // ---------------------------------------------------------------------
  // Assistente IA
  // ---------------------------------------------------------------------
  async function carregarAssistente() {
    var campo = document.getElementById("assistente-instrucoes");
    try {
      var resultado = await cliente()
        .from("config_assistente")
        .select("instrucoes_extras")
        .eq("id", 1)
        .maybeSingle();
      if (resultado.error) throw resultado.error;
      campo.value = resultado.data ? resultado.data.instrucoes_extras || "" : "";
    } catch (erro) {
      console.error("[Remop Admin] Falha ao carregar config do assistente:", erro);
    }
  }

  async function salvarAssistente(evento) {
    evento.preventDefault();
    var campo = document.getElementById("assistente-instrucoes");
    var statusEl = elementos.painel.querySelector("[data-status-assistente]");
    var botaoSalvar = evento.target.querySelector('[type="submit"]');

    botaoSalvar.disabled = true;
    exibirStatus(statusEl, "Salvando...", "");

    try {
      var resultado = await cliente().from("config_assistente").upsert({
        id: 1,
        instrucoes_extras: campo.value.trim(),
        atualizado_em: new Date().toISOString(),
      });
      if (resultado.error) throw resultado.error;
      exibirStatus(statusEl, "Instruções salvas — já valem pra próxima conversa.", "sucesso");
    } catch (erro) {
      console.error("[Remop Admin] Falha ao salvar config do assistente:", erro);
      exibirStatus(statusEl, "Não foi possível salvar agora.", "erro");
    } finally {
      botaoSalvar.disabled = false;
    }
  }

  // ---------------------------------------------------------------------
  // Login / bootstrap
  // ---------------------------------------------------------------------
  function mostrarPainel() {
    elementos.login.hidden = true;
    elementos.painel.hidden = false;
    mostrarSecao(secaoAtualDoHash());
    carregarDados().catch(function (erro) {
      console.error("[Remop Admin] Falha ao carregar dados do dashboard:", erro);
    });
  }

  function mostrarLogin(mensagemErro) {
    elementos.painel.hidden = true;
    elementos.login.hidden = false;
    if (mensagemErro) {
      elementos.statusLogin.textContent = mensagemErro;
      elementos.statusLogin.className = "mensagem-status mensagem-status--erro";
      elementos.formLogin.reset();
      elementos.formLogin.pin.focus();
    }
  }

  async function tratarLogin(evento) {
    evento.preventDefault();
    var pin = elementos.formLogin.pin.value.trim();

    elementos.statusLogin.textContent = "Entrando...";
    elementos.statusLogin.className = "mensagem-status";

    var resultado = await cliente().auth.signInWithPassword({
      email: PAINEL_EMAIL_FIXO,
      password: pin + SUFIXO_SENHA_PIN,
    });
    if (resultado.error) {
      mostrarLogin("PIN incorreto.");
    }
  }

  function tratarSair() {
    cliente().auth.signOut();
  }

  function iniciar() {
    elementos = {
      login: document.querySelector("[data-admin-login]"),
      painel: document.querySelector("[data-admin-painel]"),
      formLogin: document.querySelector("[data-form-login]"),
      statusLogin: document.querySelector("[data-status-login]"),
      canvas: document.querySelector("[data-admin-canvas]"),
      periodo: document.querySelector("[data-periodo]"),
      filtroClientes: document.querySelector("[data-filtro-clientes]"),
      galeriaGrid: document.querySelector("[data-galeria-grid]"),
    };

    if (!window.RemopSupabase || !window.RemopSupabase.pronto) {
      elementos.statusLogin.textContent =
        "Supabase ainda não configurado neste ambiente — preencha assets/js/config.js (veja o README).";
      elementos.statusLogin.className = "mensagem-status mensagem-status--erro";
      elementos.formLogin.querySelector('[type="submit"]').disabled = true;
      return;
    }

    elementos.formLogin.addEventListener("submit", tratarLogin);
    document.querySelector("[data-sair]").addEventListener("click", tratarSair);
    elementos.periodo.addEventListener("change", carregarDados);
    iniciarToggles();
    iniciarNavegacao();
    iniciarFiltroClientes();
    document.querySelector("[data-form-galeria]").addEventListener("submit", enviarFotoGaleria);
    document.querySelector("[data-form-assistente]").addEventListener("submit", salvarAssistente);

    cliente().auth.onAuthStateChange(function (evento, sessao) {
      if (sessao && sessao.user) {
        mostrarPainel();
      } else {
        mostrarLogin();
      }
    });
  }

  document.addEventListener("DOMContentLoaded", iniciar);
})();
