/**
 * Painel administrativo — login por PIN (Supabase Auth por baixo dos
 * panos) + dashboard (KPIs 3D/cinematográficos e gráfico 3D em Three.js,
 * com dados reais) + Clientes + Galeria + Assistente IA, com dados reais
 * das tabelas que assets/js/analytics.js, visitor-gate.js, lead-form.js e
 * o próprio painel gravam no Supabase.
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
  var CLIENTES_LOTE = 500; // teto de linhas cruas buscadas por tabela — folgado pra escala de uma oficina pequena
  var CLIENTES_POR_PAGINA = 20;

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

    // O gráfico 3D fica renderizando (WebGL) o tempo todo, mesmo fora de
    // tela — pausa quando sai do Dashboard, retoma quando volta.
    if (window.RemopGrafico3D) {
      if (nome === "dashboard") window.RemopGrafico3D.retomar();
      else window.RemopGrafico3D.pausar();
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

  // Ordem fixa das séries do gráfico 3D — compartilhada entre a montagem e
  // os toggles, pra achar o grupo de barras certo por chave.
  var ORDEM_SERIES_GRAFICO = ["visitantes", "agendamentos", "cliques", "perguntas", "paginasVistas"];
  var ROTULOS_SERIE_GRAFICO = {
    visitantes: "Visitantes (portão)",
    agendamentos: "Agendamentos",
    cliques: "Cliques",
    perguntas: "Perguntas IA",
    paginasVistas: "Páginas vistas",
  };

  function renderizarGraficoPrincipal(dias, porTabela) {
    var vazio = dias.map(function () { return 0; });
    var series = {
      visitantes: porTabela.visitantes.erro ? vazio : contarPorDia(porTabela.visitantes.linhas, dias),
      agendamentos: porTabela.agendamentos.erro ? vazio : contarPorDia(porTabela.agendamentos.linhas, dias),
      cliques: porTabela.cliques.erro ? vazio : contarPorDia(porTabela.cliques.linhas, dias),
      perguntas: porTabela.perguntas_ia.erro ? vazio : contarPorDia(porTabela.perguntas_ia.linhas, dias),
      paginasVistas: porTabela.paginas_vistas.erro ? vazio : contarPorDia(porTabela.paginas_vistas.linhas, dias),
    };

    window.RemopGrafico3D.montar(elementos.grafico3d, {
      dias: dias,
      series: series,
      seriesAtivas: seriesAtivas,
      cores: CORES,
      ordemSeries: ORDEM_SERIES_GRAFICO,
      opcoes: {
        reduzMovimento: REDUZ_MOVIMENTO,
        formatarTooltip: function (dadosBarra) {
          var dia = dias[dadosBarra.indiceDia];
          var rotulo = ROTULOS_SERIE_GRAFICO[dadosBarra.chave] || dadosBarra.chave;
          return formatarDataCurta(dia) + " — " + rotulo + ": " + dadosBarra.valor;
        },
      },
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
        window.RemopGrafico3D.definirVisibilidade(chave, seriesAtivas[chave]);
      });
    });
  }

  // Reaproveitada em toda seção do painel (Dashboard, Clientes, Galeria,
  // Assistente) — não é um efeito exclusivo do Dashboard. Remove a classe
  // assim que a animação termina: sem isso, o "fill: both" prende o
  // "transform" no valor final da animação pra sempre, e trava qualquer
  // transform de :hover ou de JS que o elemento devesse ter depois.
  function aplicarEntradaEscalonada(seletor) {
    if (REDUZ_MOVIMENTO) return;
    var alvos = elementos.painel.querySelectorAll(seletor);
    alvos.forEach(function (elemento, indice) {
      elemento.style.animationDelay = Math.min(indice * 70, 560) + "ms";
      elemento.classList.add("admin-entrada-3d");
      elemento.addEventListener("animationend", function limpar() {
        elemento.classList.remove("admin-entrada-3d");
        elemento.style.animationDelay = "";
        elemento.removeEventListener("animationend", limpar);
      });
    });
  }

  // O tilt 3D fica sempre ligado (uma deriva lenta e contínua, com fase
  // diferente por card) — não só quando o mouse passa em cima. É isso que
  // faz o efeito aparecer de verdade numa screenshot parada, não só numa
  // interação que ninguém vê num print. Reaproveitado pros cards de KPI e
  // pras fotos da galeria.
  function iniciarTiltCards(seletor) {
    if (REDUZ_MOVIMENTO || !window.requestAnimationFrame) return;

    elementos.painel.querySelectorAll(seletor).forEach(function (card, indice) {
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

  // Cada bloco do dashboard roda isolado — uma exceção em qualquer um
  // (ex.: o gráfico 3D falhando por falta de WebGL) não pode mais
  // derrubar o resto do dashboard, que já teria dados válidos pra mostrar.
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
  // Clientes — perfil por telefone (agrupa agendamentos + visitas do
  // portão numa única pessoa, em vez de duas tabelas técnicas separadas)
  // ---------------------------------------------------------------------
  var ROTULOS_STATUS_AGENDAMENTO = {
    novo: "Novo",
    confirmado: "Confirmado",
    atendido: "Atendido",
    cancelado: "Cancelado",
  };

  var ICONE_WHATSAPP =
    '<svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.83 9.83 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884M20.52 3.449C18.24 1.245 15.24 0 12.045 0 5.463 0 .104 5.36.101 11.943c0 2.105.55 4.16 1.595 5.986L0 24l6.335-1.652a11.86 11.86 0 0 0 5.71 1.451h.006c6.598 0 11.972-5.339 11.977-11.958a11.94 11.94 0 0 0-3.508-8.392"/></svg>';

  var clientesTodos = [];
  var clientesPaginaAtual = 0;
  var filtroClientesAtual = "";

  function normalizarTelefone(numero) {
    return String(numero || "").replace(/\D/g, "");
  }

  // Formato de exibição só pra números brasileiros com DDD (10 ou 11
  // dígitos); qualquer outra coisa aparece como veio, sem forçar formato.
  function formatarTelefoneExibicao(numero) {
    var digitos = normalizarTelefone(numero);
    if (digitos.length === 11) return "(" + digitos.slice(0, 2) + ") " + digitos.slice(2, 7) + "-" + digitos.slice(7);
    if (digitos.length === 10) return "(" + digitos.slice(0, 2) + ") " + digitos.slice(2, 6) + "-" + digitos.slice(6);
    return numero || "–";
  }

  function montarLinkWhatsAppCliente(numero, mensagem) {
    var digitos = normalizarTelefone(numero);
    if (!digitos) return "";
    if (digitos.length <= 11) digitos = "55" + digitos; // já tem DDD, só falta o código do país
    return "https://wa.me/" + digitos + "?text=" + encodeURIComponent(mensagem || "");
  }

  function agruparClientes(agendamentos, visitantes) {
    var mapa = {};
    function obter(chave) {
      if (!mapa[chave]) {
        mapa[chave] = {
          chave: chave,
          nome: "",
          telefone: "",
          carro: "",
          ano: "",
          agendamentos: [],
          totalVisitas: 0,
          ultimaAtividade: null,
        };
      }
      return mapa[chave];
    }
    function marcarAtividade(registro, criadoEm) {
      var data = criadoEm ? new Date(criadoEm) : null;
      if (data && (!registro.ultimaAtividade || data > registro.ultimaAtividade)) registro.ultimaAtividade = data;
    }

    agendamentos.forEach(function (linha) {
      var chave = normalizarTelefone(linha.telefone);
      if (!chave) return;
      var registro = obter(chave);
      registro.telefone = linha.telefone;
      if (linha.nome) registro.nome = linha.nome;
      registro.agendamentos.push(linha);
      marcarAtividade(registro, linha.criado_em);
    });

    visitantes.forEach(function (linha) {
      var chave = normalizarTelefone(linha.whatsapp);
      if (!chave) return;
      var registro = obter(chave);
      if (!registro.telefone) registro.telefone = linha.whatsapp;
      if (linha.nome && !registro.nome) registro.nome = linha.nome;
      if (linha.modelo_carro) registro.carro = linha.modelo_carro;
      if (linha.ano_carro) registro.ano = linha.ano_carro;
      registro.totalVisitas++;
      marcarAtividade(registro, linha.criado_em);
    });

    return Object.keys(mapa)
      .map(function (chave) { return mapa[chave]; })
      .sort(function (a, b) {
        var ta = a.ultimaAtividade ? a.ultimaAtividade.getTime() : 0;
        var tb = b.ultimaAtividade ? b.ultimaAtividade.getTime() : 0;
        return tb - ta;
      });
  }

  function encontrarAgendamentoPorId(id) {
    for (var i = 0; i < clientesTodos.length; i++) {
      var encontrado = clientesTodos[i].agendamentos.filter(function (a) { return a.id === id; })[0];
      if (encontrado) return encontrado;
    }
    return null;
  }

  async function atualizarStatusAgendamento(id, novoStatus, selectEl) {
    selectEl.disabled = true;
    try {
      var resultado = await cliente().from("agendamentos").update({ status: novoStatus }).eq("id", id);
      if (resultado.error) throw resultado.error;
      var item = encontrarAgendamentoPorId(id);
      if (item) item.status = novoStatus;
    } catch (erro) {
      console.error("[Remop Admin] Falha ao atualizar status do agendamento:", erro);
      window.alert("Não foi possível salvar esse status agora. Tente de novo.");
      selectEl.value = (encontrarAgendamentoPorId(id) || {}).status || "novo";
    } finally {
      selectEl.disabled = false;
    }
  }

  function construirLinhaAgendamento(linha) {
    var linhaEl = document.createElement("div");
    linhaEl.className = "admin-agendamento-linha";

    var texto = document.createElement("div");
    texto.className = "admin-agendamento-linha__texto";
    var principal = document.createElement("p");
    principal.textContent = formatarDataHora(linha.criado_em) + " — " + (linha.servico || "Avaliação geral");
    texto.appendChild(principal);
    if (linha.mensagem) {
      var mensagem = document.createElement("p");
      mensagem.className = "admin-agendamento-linha__mensagem";
      mensagem.textContent = "“" + linha.mensagem + "”";
      texto.appendChild(mensagem);
    }
    linhaEl.appendChild(texto);

    var select = document.createElement("select");
    select.className = "admin-status-select";
    Object.keys(ROTULOS_STATUS_AGENDAMENTO).forEach(function (valor) {
      var option = document.createElement("option");
      option.value = valor;
      option.textContent = ROTULOS_STATUS_AGENDAMENTO[valor];
      if ((linha.status || "novo") === valor) option.selected = true;
      select.appendChild(option);
    });
    select.addEventListener("change", function () {
      atualizarStatusAgendamento(linha.id, select.value, select);
    });
    linhaEl.appendChild(select);

    return linhaEl;
  }

  function construirCardCliente(registro) {
    var card = document.createElement("div");
    card.className = "admin-cliente-card";

    var cabecalho = document.createElement("div");
    cabecalho.className = "admin-cliente-card__cabecalho";

    var identidade = document.createElement("div");
    var nome = document.createElement("h3");
    nome.textContent = registro.nome || "Cliente sem nome";
    identidade.appendChild(nome);
    var telefoneEl = document.createElement("p");
    telefoneEl.className = "admin-cliente-card__telefone";
    telefoneEl.textContent = formatarTelefoneExibicao(registro.telefone);
    identidade.appendChild(telefoneEl);
    cabecalho.appendChild(identidade);

    var linkWhatsApp = montarLinkWhatsAppCliente(
      registro.telefone,
      registro.nome ? "Olá, " + registro.nome + "! Aqui é da Remop Retífica." : "Olá! Aqui é da Remop Retífica."
    );
    if (linkWhatsApp) {
      var botaoWhatsApp = document.createElement("a");
      botaoWhatsApp.className = "botao botao--whatsapp botao--sm";
      botaoWhatsApp.target = "_blank";
      botaoWhatsApp.rel = "noopener";
      botaoWhatsApp.href = linkWhatsApp;
      botaoWhatsApp.innerHTML = ICONE_WHATSAPP + " Chamar no WhatsApp";
      cabecalho.appendChild(botaoWhatsApp);
    }
    card.appendChild(cabecalho);

    var resumoPartes = [];
    if (registro.carro) resumoPartes.push(registro.carro + (registro.ano ? " (" + registro.ano + ")" : ""));
    resumoPartes.push(registro.totalVisitas + (registro.totalVisitas === 1 ? " visita ao site" : " visitas ao site"));
    resumoPartes.push(registro.agendamentos.length + (registro.agendamentos.length === 1 ? " agendamento" : " agendamentos"));
    if (registro.ultimaAtividade) resumoPartes.push("última atividade em " + formatarDataCurta(registro.ultimaAtividade));

    var resumo = document.createElement("p");
    resumo.className = "admin-cliente-card__resumo";
    resumo.textContent = resumoPartes.join(" · ");
    card.appendChild(resumo);

    if (registro.agendamentos.length) {
      var listaAgendamentos = document.createElement("div");
      listaAgendamentos.className = "admin-cliente-card__agendamentos";
      ordenarPorDataDesc(registro.agendamentos).forEach(function (agendamento) {
        listaAgendamentos.appendChild(construirLinhaAgendamento(agendamento));
      });
      card.appendChild(listaAgendamentos);
    }

    return card;
  }

  function clientesFiltrados() {
    var filtro = filtroClientesAtual.trim().toLowerCase();
    if (!filtro) return clientesTodos;
    var filtroDigitos = normalizarTelefone(filtro);
    return clientesTodos.filter(function (registro) {
      var nomeBate = (registro.nome || "").toLowerCase().indexOf(filtro) !== -1;
      var telefoneBate = filtroDigitos && normalizarTelefone(registro.telefone).indexOf(filtroDigitos) !== -1;
      return nomeBate || telefoneBate;
    });
  }

  function renderizarClientes() {
    var lista = elementos.painel.querySelector("[data-clientes-lista]");
    if (!lista) return;
    lista.innerHTML = "";

    var filtrados = clientesFiltrados();
    var visiveis = filtrados.slice(0, (clientesPaginaAtual + 1) * CLIENTES_POR_PAGINA);

    if (!visiveis.length) {
      var vazio = document.createElement("p");
      vazio.className = "admin-texto-apoio";
      vazio.textContent = filtroClientesAtual
        ? "Nenhum cliente encontrado com esse nome ou telefone."
        : "Nenhum cliente registrado ainda.";
      lista.appendChild(vazio);
    } else {
      visiveis.forEach(function (registro) { lista.appendChild(construirCardCliente(registro)); });
      aplicarEntradaEscalonada("[data-clientes-lista] .admin-cliente-card");
    }

    var info = elementos.painel.querySelector("[data-clientes-paginacao-info]");
    var botaoMais = elementos.painel.querySelector("[data-clientes-mostrar-mais]");
    if (info) info.textContent = filtrados.length ? "Mostrando " + visiveis.length + " de " + filtrados.length + " clientes" : "";
    if (botaoMais) botaoMais.hidden = visiveis.length >= filtrados.length;
  }

  function atualizarStatsClientes() {
    var totalAgendamentos = 0;
    clientesTodos.forEach(function (registro) { totalAgendamentos += registro.agendamentos.length; });
    var elAgendamentos = elementos.painel.querySelector('[data-clientes-stat="agendamentos"]');
    var elClientes = elementos.painel.querySelector('[data-clientes-stat="clientesUnicos"]');
    if (elAgendamentos) elAgendamentos.textContent = totalAgendamentos;
    if (elClientes) elClientes.textContent = clientesTodos.length;
  }

  async function carregarClientes() {
    var lista = elementos.painel.querySelector("[data-clientes-lista]");
    try {
      var resultados = await Promise.all([
        buscarPeriodo("agendamentos", null, null, CLIENTES_LOTE),
        buscarPeriodo("visitantes", null, null, CLIENTES_LOTE),
      ]);
      clientesTodos = agruparClientes(resultados[0], resultados[1]);
      clientesPaginaAtual = 0;
      renderizarClientes();
      atualizarStatsClientes();
    } catch (erro) {
      console.error("[Remop Admin] Falha ao carregar clientes:", erro);
      if (lista) {
        lista.innerHTML = "";
        var erroEl = document.createElement("p");
        erroEl.className = "admin-texto-apoio";
        erroEl.textContent = "Não foi possível carregar os clientes agora. Tente recarregar a página.";
        lista.appendChild(erroEl);
      }
    }
  }

  function iniciarFiltroClientes() {
    var temporizador = null;
    elementos.filtroClientes.addEventListener("input", function () {
      clearTimeout(temporizador);
      temporizador = setTimeout(function () {
        filtroClientesAtual = elementos.filtroClientes.value;
        clientesPaginaAtual = 0;
        renderizarClientes();
      }, 200);
    });
  }

  function iniciarMostrarMaisClientes() {
    var botao = elementos.painel.querySelector("[data-clientes-mostrar-mais]");
    if (!botao) return;
    botao.addEventListener("click", function () {
      clientesPaginaAtual++;
      renderizarClientes();
    });
  }

  // ---------------------------------------------------------------------
  // Galeria
  // ---------------------------------------------------------------------
  function atualizarResumoGaleria(total) {
    var resumoEl = elementos.painel.querySelector("[data-galeria-resumo]");
    if (!resumoEl) return;
    resumoEl.textContent = total
      ? total + (total === 1 ? " foto publicada na galeria." : " fotos publicadas na galeria.")
      : "Nenhuma foto publicada ainda — adicione a primeira abaixo.";
  }

  function renderizarGaleria(fotos) {
    var grade = elementos.galeriaGrid;
    grade.innerHTML = "";
    atualizarResumoGaleria(fotos.length);

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

    aplicarEntradaEscalonada(".admin-galeria-item");
    iniciarTiltCards(".admin-galeria-item");
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
  function atualizarResumoAssistente(instrucoes) {
    var resumoEl = elementos.painel.querySelector("[data-assistente-resumo]");
    if (!resumoEl) return;
    resumoEl.textContent = (instrucoes || "").trim()
      ? "Instruções personalizadas ativas."
      : "Usando só o comportamento padrão — nenhuma instrução extra definida ainda.";
  }

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
      atualizarResumoAssistente(campo.value);
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
      atualizarResumoAssistente(campo.value);
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
    aplicarEntradaEscalonada(
      ".admin-palco, .admin-kpi-card .admin-kpi-card__inner, .admin-grafico-caixa, .admin-tabela-caixa"
    );
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
      grafico3d: document.querySelector("[data-admin-grafico-3d]"),
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
    iniciarMostrarMaisClientes();
    iniciarTiltCards(".admin-kpi-card");
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
