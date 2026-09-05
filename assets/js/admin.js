/**
 * Painel administrativo — login por PIN (Supabase Auth por baixo dos
 * panos) + dashboard (Chart.js, com KPIs 3D/cinematográficos e dados
 * reais) + Clientes + Galeria + Assistente IA, com dados reais das
 * tabelas que assets/js/analytics.js, visitor-gate.js, lead-form.js e o
 * próprio painel gravam no Supabase.
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
  var PAGINACAO_TAMANHO = 50;

  var REDUZ_MOVIMENTO = !!(
    window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );

  var CORES = {
    visitantes: "#1E2E63",
    agendamentos: "#1f8a4c",
    cliques: "#D9A916",
    perguntas: "#c0392b",
    paginasVistas: "#6c5ce7",
  };

  var ROTULOS_PAGINA = {
    "": "Home",
    "index.html": "Home",
    "institucional.html": "Institucional",
    "localizacao.html": "Localização",
  };

  var ROTULOS_BLOCO = {
    visitantes: "Visitantes (portão)",
    agendamentos: "Agendamentos",
    cliques: "Cliques",
    perguntas_ia: "Perguntas à IA",
    paginas_vistas: "Páginas vistas",
  };

  var TABELAS_ATIVIDADE = ["visitantes", "agendamentos", "cliques", "perguntas_ia", "paginas_vistas"];

  var elementos = {};
  var grafico = null;
  var seriesAtivas = {
    visitantes: true,
    agendamentos: true,
    cliques: true,
    perguntas: true,
    paginasVistas: true,
  };
  var secoesCarregadas = {};

  function cliente() {
    return window.RemopSupabase.client;
  }

  // Site publicado sob subpasta (ex.: /remop-retifica/institucional.html) —
  // compara só o nome do arquivo, não o caminho inteiro. Um caminho que
  // termina em "/" (ex.: "/remop-retifica/") é a raiz, não um arquivo com
  // esse nome — precisa virar "" pra bater com o mapa, não o último
  // segmento do diretório.
  function rotuloPagina(caminho) {
    if (!caminho) return "–";
    var limpo = caminho.split("?")[0].split("#")[0];
    var arquivo = /\/$/.test(limpo) ? "" : limpo.split("/").pop() || "";
    return ROTULOS_PAGINA.hasOwnProperty(arquivo) ? ROTULOS_PAGINA[arquivo] : arquivo || limpo || "Home";
  }

  function origemDoReferrer(referencia) {
    if (!referencia) return "Direto / link direto";
    try {
      var host = new URL(referencia).hostname.replace(/^www\./, "");
      var hostAtual = location.hostname.replace(/^www\./, "");
      if (host === hostAtual) return "Navegação interna";
      if (host.indexOf("google") !== -1) return "Google";
      if (host.indexOf("instagram") !== -1) return "Instagram";
      if (host.indexOf("facebook") !== -1) return "Facebook";
      if (host.indexOf("whatsapp") !== -1) return "WhatsApp";
      if (host.indexOf("bing") !== -1) return "Bing";
      return host;
    } catch (erro) {
      return "Direto / link direto";
    }
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

  function calcularJanelaAnterior(dias) {
    var inicio = dias[0];
    var inicioAnterior = new Date(inicio);
    inicioAnterior.setDate(inicioAnterior.getDate() - dias.length);
    return { desde: inicioAnterior, ate: inicio };
  }

  // ---------------------------------------------------------------------
  // Camada de dados — sempre ordenada e limitada/paginada, nunca um
  // select("*") solto (trava com uso real depois de alguns meses).
  // ---------------------------------------------------------------------
  async function buscarTodos(tabela) {
    var resultado = await cliente().from(tabela).select("*").order("criado_em", { ascending: false }).limit(1000);
    if (resultado.error) throw resultado.error;
    return resultado.data || [];
  }

  async function buscarPeriodo(tabela, desde, ate, limite) {
    var query = cliente().from(tabela).select("*").order("criado_em", { ascending: false });
    if (desde) query = query.gte("criado_em", desde.toISOString());
    if (ate) query = query.lt("criado_em", ate.toISOString());
    query = query.limit(limite || 1000);
    var resultado = await query;
    if (resultado.error) throw resultado.error;
    return resultado.data || [];
  }

  async function buscarPagina(tabela, opcoes) {
    opcoes = opcoes || {};
    var pagina = opcoes.pagina || 0;
    var porPagina = opcoes.porPagina || PAGINACAO_TAMANHO;
    var inicio = pagina * porPagina;
    var query = cliente().from(tabela).select("*").order("criado_em", { ascending: false });
    if (opcoes.filtroTexto) query = query.ilike(opcoes.colunaFiltro || "nome", "%" + opcoes.filtroTexto + "%");
    query = query.range(inicio, inicio + porPagina - 1);
    var resultado = await query;
    if (resultado.error) throw resultado.error;
    return resultado.data || [];
  }

  async function contarTotal(tabela, opcoes) {
    opcoes = opcoes || {};
    var query = cliente().from(tabela).select("*", { count: "exact", head: true });
    if (opcoes.filtroTexto) query = query.ilike(opcoes.colunaFiltro || "nome", "%" + opcoes.filtroTexto + "%");
    var resultado = await query;
    if (resultado.error) throw resultado.error;
    return resultado.count || 0;
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

  function contarUnicos(linhas, campo) {
    var vistos = {};
    var total = 0;
    linhas.forEach(function (linha) {
      var valor = linha[campo];
      if (valor && !vistos[valor]) {
        vistos[valor] = true;
        total++;
      }
    });
    return total;
  }

  function agruparEContar(linhas, extrairRotulo) {
    var contagem = {};
    linhas.forEach(function (linha) {
      var rotulo = extrairRotulo(linha) || "–";
      contagem[rotulo] = (contagem[rotulo] || 0) + 1;
    });
    return Object.keys(contagem)
      .map(function (rotulo) { return { rotulo: rotulo, total: contagem[rotulo] }; })
      .sort(function (a, b) { return b.total - a.total; });
  }

  // ---------------------------------------------------------------------
  // Helpers de tabela (usados no dashboard e em Clientes)
  // ---------------------------------------------------------------------
  function linhaVazia(colSpan, texto) {
    var tr = document.createElement("tr");
    var td = document.createElement("td");
    td.colSpan = colSpan;
    td.textContent = texto;
    tr.appendChild(td);
    return tr;
  }

  function linhaTabela(celulas, indicesTextoLongo) {
    var tr = document.createElement("tr");
    celulas.forEach(function (texto, indice) {
      var td = document.createElement("td");
      td.textContent = texto;
      if (indicesTextoLongo && indicesTextoLongo.indexOf(indice) !== -1) {
        td.classList.add("admin-celula-texto");
      }
      tr.appendChild(td);
    });
    return tr;
  }

  function renderizarTabelaAgrupada(seletor, itens, mensagemVazia) {
    var corpo = elementos.painel.querySelector(seletor + " tbody");
    corpo.innerHTML = "";
    if (!itens.length) {
      corpo.appendChild(linhaVazia(2, mensagemVazia));
      return;
    }
    itens.forEach(function (item) {
      corpo.appendChild(linhaTabela([item.rotulo, item.total]));
    });
  }

  function exibirStatus(elemento, mensagem, tipo) {
    elemento.textContent = mensagem;
    elemento.className = "mensagem-status" + (tipo ? " mensagem-status--" + tipo : "");
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
  // Dashboard — efeito 3D/cinematográfico
  // ---------------------------------------------------------------------
  function animarValor(elemento, valorFinal, formatar) {
    formatar = formatar || function (v) { return String(v); };
    if (REDUZ_MOVIMENTO || !window.requestAnimationFrame) {
      elemento.textContent = formatar(valorFinal);
      return;
    }
    var inicio = null;
    var duracao = 800;
    function passo(agora) {
      if (!inicio) inicio = agora;
      var progresso = Math.min((agora - inicio) / duracao, 1);
      var facilitado = 1 - Math.pow(1 - progresso, 3);
      elemento.textContent = formatar(Math.round(valorFinal * facilitado));
      if (progresso < 1) requestAnimationFrame(passo);
      else elemento.textContent = formatar(valorFinal);
    }
    requestAnimationFrame(passo);
  }

  function calcularVariacao(atual, anterior) {
    if (!anterior) {
      return atual > 0
        ? { texto: "▲ novo no período", direcao: "alta" }
        : { texto: "sem variação", direcao: "neutro" };
    }
    var percentual = Math.round(((atual - anterior) / anterior) * 100);
    var seta = percentual > 0 ? "▲ " : percentual < 0 ? "▼ " : "";
    return {
      texto: seta + (percentual > 0 ? "+" : "") + percentual + "% vs. período anterior",
      direcao: percentual > 0 ? "alta" : percentual < 0 ? "baixa" : "neutro",
    };
  }

  function definirKpi(chave, valor, variacao, formatar) {
    var card = elementos.painel.querySelector('[data-kpi="' + chave + '"]');
    if (!card) return;
    animarValor(card.querySelector("[data-kpi-numero]"), valor, formatar);
    var variacaoEl = card.querySelector("[data-kpi-variacao]");
    variacaoEl.textContent = variacao.texto;
    variacaoEl.className = "admin-kpi-card__variacao admin-kpi-card__variacao--" + variacao.direcao;
  }

  function renderizarResumo(porTabela) {
    var resumoEl = elementos.painel.querySelector("[data-admin-resumo]");
    var paginasVistas = porTabela.paginas_vistas;
    var agendamentos = porTabela.agendamentos;
    var visitantesGate = porTabela.visitantes;

    if (paginasVistas.erro || agendamentos.erro || visitantesGate.erro) {
      resumoEl.textContent = "Alguns dados não puderam ser carregados agora — veja o aviso acima.";
      return;
    }

    var unicos = contarUnicos(paginasVistas.linhas, "visitante_id");
    var totalAgendamentos = agendamentos.linhas.length;
    var totalGate = visitantesGate.linhas.length;

    if (!unicos && !totalGate) {
      resumoEl.textContent =
        "Ainda sem visitas registradas neste período — assim que alguém acessar o site, os números aparecem aqui.";
      return;
    }

    var conversao = totalGate ? Math.round((totalAgendamentos / totalGate) * 100) : 0;
    resumoEl.textContent =
      unicos +
      (unicos === 1 ? " pessoa visitou" : " pessoas visitaram") +
      " o site nesse período, " +
      totalAgendamentos +
      (totalAgendamentos === 1 ? " pediu" : " pediram") +
      " avaliação — " +
      conversao +
      "% de conversão do portão de entrada.";
  }

  function renderizarKpis(porTabela) {
    var visitantesGate = porTabela.visitantes;
    var agendamentos = porTabela.agendamentos;
    var cliques = porTabela.cliques;
    var paginasVistas = porTabela.paginas_vistas;

    if (!paginasVistas.erro) {
      var unicosAtual = contarUnicos(paginasVistas.linhas, "visitante_id");
      var unicosAnterior = contarUnicos(paginasVistas.linhasAnteriores, "visitante_id");
      definirKpi("visitantesUnicos", unicosAtual, calcularVariacao(unicosAtual, unicosAnterior));
    }

    if (!agendamentos.erro) {
      definirKpi(
        "agendamentos",
        agendamentos.linhas.length,
        calcularVariacao(agendamentos.linhas.length, agendamentos.linhasAnteriores.length)
      );
    }

    if (!cliques.erro) {
      definirKpi(
        "cliques",
        cliques.linhas.length,
        calcularVariacao(cliques.linhas.length, cliques.linhasAnteriores.length)
      );
    }

    if (!visitantesGate.erro && !agendamentos.erro) {
      var conversaoAtual = visitantesGate.linhas.length
        ? Math.round((agendamentos.linhas.length / visitantesGate.linhas.length) * 100)
        : 0;
      var conversaoAnterior = visitantesGate.linhasAnteriores.length
        ? Math.round((agendamentos.linhasAnteriores.length / visitantesGate.linhasAnteriores.length) * 100)
        : 0;
      definirKpi(
        "conversao",
        conversaoAtual,
        calcularVariacao(conversaoAtual, conversaoAnterior),
        function (v) { return v + "%"; }
      );
    }

    renderizarResumo(porTabela);
  }

  // Ordem fixa das séries do gráfico — compartilhada entre a montagem e os
  // toggles, pra achar o dataset certo por índice em vez de guardar uma
  // propriedade não-padrão dentro do objeto que o Chart.js gerencia.
  var SERIES_GRAFICO = [
    { chave: "visitantes", label: "Visitantes (portão)" },
    { chave: "agendamentos", label: "Agendamentos" },
    { chave: "cliques", label: "Cliques" },
    { chave: "perguntas", label: "Perguntas IA" },
    { chave: "paginasVistas", label: "Páginas vistas" },
  ];

  function construirGradiente(ctx, cor) {
    var gradiente = ctx.createLinearGradient(0, 0, 0, 300);
    gradiente.addColorStop(0, cor + "55");
    gradiente.addColorStop(1, cor + "00");
    return gradiente;
  }

  function montarGrafico(dias, series) {
    var rotulos = dias.map(formatarDataCurta);
    var ctx = elementos.canvas.getContext("2d");
    var pontosVazios = dias.map(function () { return 0; });
    var datasets = SERIES_GRAFICO.map(function (item) {
      var cor = CORES[item.chave];
      var pontos = series[item.chave];
      return {
        label: item.label,
        // Chart.js lança exceção síncrona dentro do próprio construtor se
        // "data" não for um array de verdade — nunca deixar passar direto.
        data: Array.isArray(pontos) ? pontos : pontosVazios,
        borderColor: cor,
        backgroundColor: construirGradiente(ctx, cor),
        fill: true,
        borderWidth: 2,
        tension: 0.35,
        pointRadius: 0,
        pointHoverRadius: 4,
        hidden: !seriesAtivas[item.chave],
      };
    });

    if (grafico) grafico.destroy();
    grafico = new Chart(ctx, {
      type: "line",
      data: { labels: rotulos, datasets: datasets },
      options: {
        responsive: true,
        animation: REDUZ_MOVIMENTO ? false : { duration: 700, easing: "easeOutCubic" },
        interaction: { mode: "index", intersect: false },
        plugins: { legend: { display: false } },
        scales: { y: { beginAtZero: true, ticks: { precision: 0 } } },
      },
    });
  }

  function renderizarGraficoPrincipal(dias, porTabela) {
    var vazio = dias.map(function () { return 0; });
    montarGrafico(dias, {
      visitantes: porTabela.visitantes.erro ? vazio : contarPorDia(porTabela.visitantes.linhas, dias),
      agendamentos: porTabela.agendamentos.erro ? vazio : contarPorDia(porTabela.agendamentos.linhas, dias),
      cliques: porTabela.cliques.erro ? vazio : contarPorDia(porTabela.cliques.linhas, dias),
      perguntas: porTabela.perguntas_ia.erro ? vazio : contarPorDia(porTabela.perguntas_ia.linhas, dias),
      paginasVistas: porTabela.paginas_vistas.erro ? vazio : contarPorDia(porTabela.paginas_vistas.linhas, dias),
    });
  }

  function renderizarFunil(porTabela) {
    var visitantesGate = porTabela.visitantes;
    var agendamentos = porTabela.agendamentos;
    var elVisitantes = elementos.painel.querySelector("[data-funil-visitantes]");
    var elAgendamentos = elementos.painel.querySelector("[data-funil-agendamentos]");
    var barra = elementos.painel.querySelector("[data-funil-barra]");

    if (visitantesGate.erro || agendamentos.erro) {
      elVisitantes.textContent = "–";
      elAgendamentos.textContent = "–";
      barra.style.setProperty("--preenchido", "0%");
      return;
    }

    var totalGate = visitantesGate.linhas.length;
    var totalAgendamentos = agendamentos.linhas.length;
    var percentual = totalGate ? Math.min(Math.round((totalAgendamentos / totalGate) * 100), 100) : 0;

    elVisitantes.textContent = totalGate;
    elAgendamentos.textContent = totalAgendamentos;
    barra.style.setProperty("--preenchido", percentual + "%");
  }

  function preencherTabelaPerguntas(linhas) {
    var corpo = elementos.painel.querySelector("[data-tabela-perguntas] tbody");
    corpo.innerHTML = "";
    var ordenadas = ordenarPorDataDesc(linhas).slice(0, 25);
    if (!ordenadas.length) {
      corpo.appendChild(linhaVazia(3, "Nenhuma pergunta feita à IA no período."));
      return;
    }
    ordenadas.forEach(function (linha) {
      corpo.appendChild(
        linhaTabela([formatarDataHora(linha.criado_em), rotuloPagina(linha.pagina), linha.texto || ""], [2])
      );
    });
  }

  function renderizarDetalhes(porTabela) {
    if (!porTabela.paginas_vistas.erro) {
      renderizarTabelaAgrupada(
        "[data-tabela-paginas-vistas]",
        agruparEContar(porTabela.paginas_vistas.linhas, function (l) { return rotuloPagina(l.pagina); }),
        "Nenhuma visita registrada no período."
      );
      renderizarTabelaAgrupada(
        "[data-tabela-origem]",
        agruparEContar(porTabela.paginas_vistas.linhas, function (l) { return origemDoReferrer(l.referencia); }),
        "Nenhuma visita registrada no período."
      );
    }

    if (!porTabela.perguntas_ia.erro) {
      preencherTabelaPerguntas(porTabela.perguntas_ia.linhas);
    }
  }

  function renderizarErroBanner(porTabela) {
    var banner = elementos.painel.querySelector("[data-dashboard-erro]");
    var comErro = TABELAS_ATIVIDADE.filter(function (tabela) { return porTabela[tabela].erro; });
    if (!comErro.length) {
      banner.hidden = true;
      banner.textContent = "";
      return;
    }
    var nomes = comErro.map(function (tabela) { return ROTULOS_BLOCO[tabela]; }).join(", ");
    banner.hidden = false;
    banner.textContent =
      "Não foi possível carregar agora: " + nomes + ". Os demais números continuam corretos — tente recarregar a página.";
  }

  async function carregarBlocoAtividade(tabela, desde, janelaAnterior) {
    var bloco = { tabela: tabela, linhas: [], linhasAnteriores: [], erro: null };
    try {
      var resultados = await Promise.all([
        buscarPeriodo(tabela, desde, null, 1000),
        buscarPeriodo(tabela, janelaAnterior.desde, janelaAnterior.ate, 1000),
      ]);
      bloco.linhas = resultados[0];
      bloco.linhasAnteriores = resultados[1];
    } catch (erro) {
      console.error("[Remop Admin] Falha ao carregar " + tabela + ":", erro);
      bloco.erro = erro;
    }
    return bloco;
  }

  function iniciarToggles() {
    elementos.painel.querySelectorAll("[data-toggle-serie]").forEach(function (botao) {
      botao.addEventListener("click", function () {
        var chave = botao.getAttribute("data-toggle-serie");
        seriesAtivas[chave] = !seriesAtivas[chave];
        botao.classList.toggle("admin-toggle--ativo", seriesAtivas[chave]);

        if (!grafico) return;
        var indice = SERIES_GRAFICO.map(function (item) { return item.chave; }).indexOf(chave);
        var dataset = grafico.data.datasets[indice];
        if (dataset) {
          dataset.hidden = !seriesAtivas[chave];
          grafico.update();
        }
      });
    });
  }

  function aplicarEntradaEscalonada() {
    if (REDUZ_MOVIMENTO) return;
    var alvos = elementos.painel.querySelectorAll(
      ".admin-kpi-card .admin-kpi-card__inner, .admin-grafico-caixa, .admin-tabela-caixa"
    );
    alvos.forEach(function (elemento, indice) {
      elemento.style.animationDelay = Math.min(indice * 70, 560) + "ms";
      elemento.classList.add("admin-entrada-3d");
    });
  }

  // O tilt 3D fica sempre ligado (uma deriva lenta e contínua, com fase
  // diferente por card) — não só quando o mouse passa em cima. É isso que
  // faz o efeito aparecer de verdade numa screenshot parada, não só numa
  // interação que ninguém vê num print.
  function iniciarTiltCards() {
    if (REDUZ_MOVIMENTO || !window.requestAnimationFrame) return;

    elementos.painel.querySelectorAll(".admin-kpi-card").forEach(function (card, indice) {
      var fase = indice * 1.3;
      var ponteiro = null;

      function passo(tempoMs) {
        if (!ponteiro) {
          var t = tempoMs / 1000;
          var x = Math.sin(t * 0.6 + fase) * 0.35;
          var y = Math.cos(t * 0.5 + fase) * 0.35;
          card.style.setProperty("--tilt-x", (y * -10).toFixed(2) + "deg");
          card.style.setProperty("--tilt-y", (x * 10).toFixed(2) + "deg");
        }
        requestAnimationFrame(passo);
      }
      requestAnimationFrame(passo);

      card.addEventListener("mousemove", function (evento) {
        var retangulo = card.getBoundingClientRect();
        ponteiro = {
          x: (evento.clientX - retangulo.left) / retangulo.width - 0.5,
          y: (evento.clientY - retangulo.top) / retangulo.height - 0.5,
        };
        card.style.setProperty("--tilt-x", (ponteiro.y * -14).toFixed(2) + "deg");
        card.style.setProperty("--tilt-y", (ponteiro.x * 14).toFixed(2) + "deg");
      });
      card.addEventListener("mouseleave", function () {
        ponteiro = null;
      });
    });
  }

  // Cada bloco do dashboard roda isolado — uma exceção (ex.: Chart.js
  // recusando um dataset malformado) não pode mais derrubar o resto do
  // dashboard, que já teria dados válidos prontos pra mostrar.
  function executarComSeguranca(nome, fn) {
    try {
      fn();
    } catch (erro) {
      console.error("[Remop Admin] Falha ao renderizar " + nome + ":", erro);
    }
  }

  async function carregarDashboard() {
    var periodoDias = parseInt(elementos.periodo.value, 10) || 30;
    var dias = gerarFaixaDeDias(periodoDias);
    var desde = dias[0];
    var janelaAnterior = calcularJanelaAnterior(dias);

    var container = elementos.painel.querySelector("[data-admin-dashboard]");
    if (container) container.classList.add("is-carregando");

    try {
      var resultados = await Promise.all(
        TABELAS_ATIVIDADE.map(function (tabela) {
          return carregarBlocoAtividade(tabela, desde, janelaAnterior);
        })
      );
      var porTabela = {};
      resultados.forEach(function (bloco) { porTabela[bloco.tabela] = bloco; });

      executarComSeguranca("aviso de erro", function () { renderizarErroBanner(porTabela); });
      executarComSeguranca("KPIs", function () { renderizarKpis(porTabela); });
      executarComSeguranca("gráfico", function () { renderizarGraficoPrincipal(dias, porTabela); });
      executarComSeguranca("funil", function () { renderizarFunil(porTabela); });
      executarComSeguranca("tabelas de detalhe", function () { renderizarDetalhes(porTabela); });
    } finally {
      if (container) container.classList.remove("is-carregando");
    }
  }

  // ---------------------------------------------------------------------
  // Clientes — paginação real + status editável nos agendamentos
  // ---------------------------------------------------------------------
  var clientesEstado = {
    agendamentos: { pagina: 0, itens: [], total: 0 },
    visitantes: { pagina: 0, itens: [], total: 0 },
  };
  var filtroClientesAtual = "";

  async function atualizarStatusAgendamento(id, novoStatus, selectEl) {
    selectEl.disabled = true;
    try {
      var resultado = await cliente().from("agendamentos").update({ status: novoStatus }).eq("id", id);
      if (resultado.error) throw resultado.error;
      var item = clientesEstado.agendamentos.itens.filter(function (l) { return l.id === id; })[0];
      if (item) item.status = novoStatus;
    } catch (erro) {
      console.error("[Remop Admin] Falha ao atualizar status do agendamento:", erro);
      window.alert("Não foi possível salvar esse status agora. Tente de novo.");
      selectEl.value = (clientesEstado.agendamentos.itens.filter(function (l) { return l.id === id; })[0] || {}).status || "novo";
    } finally {
      selectEl.disabled = false;
    }
  }

  function linhaAgendamento(linha) {
    var tr = linhaTabela(
      [
        formatarDataHora(linha.criado_em),
        linha.nome || "–",
        linha.telefone || "–",
        linha.servico || "–",
        linha.mensagem || "–",
        linha.origem || "–",
      ],
      [4]
    );

    var tdStatus = document.createElement("td");
    var select = document.createElement("select");
    select.className = "admin-status-select";
    ["novo", "confirmado", "atendido"].forEach(function (valor) {
      var option = document.createElement("option");
      option.value = valor;
      option.textContent = valor.charAt(0).toUpperCase() + valor.slice(1);
      if ((linha.status || "novo") === valor) option.selected = true;
      select.appendChild(option);
    });
    select.addEventListener("change", function () {
      atualizarStatusAgendamento(linha.id, select.value, select);
    });
    tdStatus.appendChild(select);
    tr.appendChild(tdStatus);
    return tr;
  }

  function atualizarInfoPaginacao(tabela) {
    var estado = clientesEstado[tabela];
    var info = elementos.painel.querySelector('[data-paginacao-info="' + tabela + '"]');
    var botao = elementos.painel.querySelector('[data-carregar-mais="' + tabela + '"]');
    if (info) {
      info.textContent = estado.itens.length ? "Mostrando " + estado.itens.length + " de " + estado.total : "";
    }
    if (botao) botao.hidden = estado.itens.length >= estado.total;
  }

  function renderizarAgendamentos() {
    var corpo = elementos.painel.querySelector("[data-tabela-agendamentos] tbody");
    corpo.innerHTML = "";
    var itens = clientesEstado.agendamentos.itens;
    if (!itens.length) {
      corpo.appendChild(linhaVazia(7, "Nenhum agendamento encontrado."));
    } else {
      itens.forEach(function (linha) { corpo.appendChild(linhaAgendamento(linha)); });
    }
    atualizarInfoPaginacao("agendamentos");
  }

  function renderizarVisitantesClientes() {
    var corpo = elementos.painel.querySelector("[data-tabela-visitantes] tbody");
    corpo.innerHTML = "";
    var itens = clientesEstado.visitantes.itens;
    if (!itens.length) {
      corpo.appendChild(linhaVazia(7, "Nenhum visitante encontrado."));
    } else {
      itens.forEach(function (linha) {
        corpo.appendChild(
          linhaTabela([
            formatarDataHora(linha.criado_em),
            linha.nome || "–",
            linha.whatsapp || "–",
            linha.modelo_carro || "–",
            linha.ano_carro || "–",
            linha.origem || "–",
            rotuloPagina(linha.pagina),
          ])
        );
      });
    }
    atualizarInfoPaginacao("visitantes");
  }

  async function carregarPaginaClientes(tabela, reiniciar) {
    var estado = clientesEstado[tabela];
    if (reiniciar) {
      estado.pagina = 0;
      estado.itens = [];
    }

    var info = elementos.painel.querySelector('[data-paginacao-info="' + tabela + '"]');
    try {
      var opcoes = {
        pagina: estado.pagina,
        porPagina: PAGINACAO_TAMANHO,
        filtroTexto: filtroClientesAtual,
        colunaFiltro: "nome",
      };
      var resultados = await Promise.all([buscarPagina(tabela, opcoes), contarTotal(tabela, opcoes)]);
      estado.itens = reiniciar ? resultados[0] : estado.itens.concat(resultados[0]);
      estado.total = resultados[1];
      estado.pagina++;
    } catch (erro) {
      console.error("[Remop Admin] Falha ao carregar " + tabela + ":", erro);
      if (info) info.textContent = "Não foi possível carregar agora — tente de novo.";
    }

    if (tabela === "agendamentos") renderizarAgendamentos();
    else renderizarVisitantesClientes();
  }

  async function carregarClientes() {
    await Promise.all([
      carregarPaginaClientes("agendamentos", true),
      carregarPaginaClientes("visitantes", true),
    ]);
  }

  function iniciarFiltroClientes() {
    var temporizador = null;
    elementos.filtroClientes.addEventListener("input", function () {
      clearTimeout(temporizador);
      temporizador = setTimeout(function () {
        filtroClientesAtual = elementos.filtroClientes.value.trim();
        carregarPaginaClientes("agendamentos", true);
        carregarPaginaClientes("visitantes", true);
      }, 300);
    });
  }

  function iniciarCarregarMais() {
    elementos.painel.querySelectorAll("[data-carregar-mais]").forEach(function (botao) {
      botao.addEventListener("click", function () {
        carregarPaginaClientes(botao.getAttribute("data-carregar-mais"), false);
      });
    });
  }

  // ---------------------------------------------------------------------
  // Galeria
  // ---------------------------------------------------------------------
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
      var fotos = await buscarTodos("galeria");
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

      var existentes = await buscarTodos("galeria");
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
    aplicarEntradaEscalonada();
    carregarDashboard().catch(function (erro) {
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
    elementos.periodo.addEventListener("change", function () {
      carregarDashboard().catch(function (erro) {
        console.error("[Remop Admin] Falha ao recarregar dashboard:", erro);
      });
    });
    iniciarToggles();
    iniciarNavegacao();
    iniciarFiltroClientes();
    iniciarCarregarMais();
    iniciarTiltCards();
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
