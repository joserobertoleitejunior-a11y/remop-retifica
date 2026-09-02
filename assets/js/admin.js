/**
 * Painel administrativo — login por PIN (Firebase Auth por baixo dos
 * panos) + dashboard (Chart.js) + Clientes + Galeria + Assistente IA,
 * com dados reais das coleções que assets/js/analytics.js,
 * visitor-gate.js, lead-form.js e o próprio painel gravam no Firestore.
 *
 * Login por PIN: o Firebase Auth continua sendo o mecanismo real por
 * trás (é o que autoriza a leitura protegida no Firestore/Storage), mas
 * a equipe só digita um PIN numérico curto — o painel completa esse PIN
 * com um sufixo fixo antes de mandar pro Firebase, porque o Firebase
 * exige senha de pelo menos 6 caracteres. Ver README.md pra saber qual
 * e-mail/senha cadastrar no Firebase Console → Authentication.
 *
 * Pré-requisito (feito uma vez, fora do código): criar esse usuário em
 * Firebase Console → Authentication → Add user, e ajustar as regras do
 * Firestore/Storage (ver README.md).
 */
(function () {
  "use strict";

  var PAINEL_EMAIL_FIXO = "painel@remop-retifica.internal";
  var SUFIXO_SENHA_PIN = "-RemopPainel2026!";

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

  function rotuloPagina(caminho) {
    if (!caminho) return "–";
    var limpo = caminho.split("?")[0];
    return ROTULOS_PAGINA[limpo] || limpo;
  }

  function formatarDataCurta(data) {
    return data.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
  }

  function formatarDataHora(campo) {
    return campo && campo.toDate ? campo.toDate().toLocaleString("pt-BR") : "–";
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

  async function buscarColecao(db, nome, desde) {
    var query = db.collection(nome);
    if (desde) query = query.where("criadoEm", ">=", desde);
    var snap = await query.get();
    return snap.docs.map(function (doc) {
      return Object.assign({ _id: doc.id }, doc.data());
    });
  }

  function ordenarPorDataDesc(docs) {
    return docs.slice().sort(function (a, b) {
      var ta = a.criadoEm && a.criadoEm.toDate ? a.criadoEm.toDate().getTime() : 0;
      var tb = b.criadoEm && b.criadoEm.toDate ? b.criadoEm.toDate().getTime() : 0;
      return tb - ta;
    });
  }

  function contarPorDia(docs, dias) {
    var contagem = dias.map(function () { return 0; });
    docs.forEach(function (doc) {
      if (!doc.criadoEm || !doc.criadoEm.toDate) return;
      var data = doc.criadoEm.toDate();
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

  function preencherTabelaPerguntas(docs) {
    var corpo = elementos.painel.querySelector("[data-tabela-perguntas] tbody");
    corpo.innerHTML = "";

    ordenarPorDataDesc(docs)
      .slice(0, 25)
      .forEach(function (doc) {
        var tr = document.createElement("tr");
        [formatarDataHora(doc.criadoEm), rotuloPagina(doc.pagina), doc.texto || ""].forEach(function (texto) {
          var td = document.createElement("td");
          td.textContent = texto;
          tr.appendChild(td);
        });
        corpo.appendChild(tr);
      });
  }

  function preencherCliquesPorPagina(docs) {
    var corpo = elementos.painel.querySelector("[data-tabela-cliques-pagina] tbody");
    corpo.innerHTML = "";

    var contagem = {};
    docs.forEach(function (doc) {
      var chave = rotuloPagina(doc.pagina);
      contagem[chave] = (contagem[chave] || 0) + 1;
    });

    var linhas = Object.keys(contagem)
      .map(function (pagina) { return { pagina: pagina, total: contagem[pagina] }; })
      .sort(function (a, b) { return b.total - a.total; });

    if (!linhas.length) {
      var trVazia = document.createElement("tr");
      var tdVazia = document.createElement("td");
      tdVazia.colSpan = 2;
      tdVazia.textContent = "Nenhum clique registrado no período.";
      trVazia.appendChild(tdVazia);
      corpo.appendChild(trVazia);
      return;
    }

    linhas.forEach(function (linha) {
      var tr = document.createElement("tr");
      var tdPagina = document.createElement("td");
      tdPagina.textContent = linha.pagina;
      var tdTotal = document.createElement("td");
      tdTotal.textContent = linha.total;
      tr.appendChild(tdPagina);
      tr.appendChild(tdTotal);
      corpo.appendChild(tr);
    });
  }

  async function carregarDados() {
    var db = window.RemopFirebase.db;
    var periodoDias = parseInt(elementos.periodo.value, 10) || 30;
    var dias = gerarFaixaDeDias(periodoDias);
    var desde = firebase.firestore.Timestamp.fromDate(dias[0]);

    var resultados = await Promise.all([
      buscarColecao(db, "visitantes", desde),
      buscarColecao(db, "agendamentos", desde),
      buscarColecao(db, "cliques", desde),
      buscarColecao(db, "perguntas_ia", desde),
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
      .filter(function (doc) { return !filtro || (doc.nome || "").toLowerCase().indexOf(filtro) !== -1; })
      .forEach(function (doc) {
        corpoAgendamentos.appendChild(
          linhaTabela([
            formatarDataHora(doc.criadoEm),
            doc.nome || "–",
            doc.telefone || "–",
            doc.servico || "–",
            doc.mensagem || "–",
            doc.status || "novo",
          ])
        );
      });

    var corpoVisitantes = elementos.painel.querySelector("[data-tabela-visitantes] tbody");
    corpoVisitantes.innerHTML = "";
    ordenarPorDataDesc(clientesCache.visitantes)
      .filter(function (doc) { return !filtro || (doc.nome || "").toLowerCase().indexOf(filtro) !== -1; })
      .forEach(function (doc) {
        corpoVisitantes.appendChild(
          linhaTabela([
            formatarDataHora(doc.criadoEm),
            doc.nome || "–",
            doc.whatsapp || "–",
            doc.modeloCarro || "–",
            doc.anoCarro || "–",
            rotuloPagina(doc.pagina),
          ])
        );
      });
  }

  async function carregarClientes() {
    var db = window.RemopFirebase.db;
    try {
      var resultados = await Promise.all([
        buscarColecao(db, "agendamentos", null),
        buscarColecao(db, "visitantes", null),
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
    var db = window.RemopFirebase.db;
    try {
      var fotos = await buscarColecao(db, "galeria", null);
      renderizarGaleria(fotos);
    } catch (erro) {
      console.error("[Remop Admin] Falha ao carregar a galeria:", erro);
    }
  }

  async function removerFotoGaleria(foto) {
    if (!window.confirm('Remover a foto "' + (foto.alt || foto._id) + '"?')) return;
    var firebaseInfo = window.RemopFirebase;
    try {
      if (foto.storagePath && firebaseInfo.storage) {
        await firebaseInfo.storage.ref(foto.storagePath).delete();
      }
      await firebaseInfo.db.collection("galeria").doc(foto._id).delete();
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

    var firebaseInfo = window.RemopFirebase;
    if (!firebaseInfo.storage) {
      exibirStatus(
        statusEl,
        "Firebase Storage não está configurado neste ambiente (veja o README).",
        "erro"
      );
      return;
    }

    var botaoEnviar = formulario.querySelector('[type="submit"]');
    botaoEnviar.disabled = true;
    exibirStatus(statusEl, "Enviando foto...", "");

    try {
      var caminho = "galeria/" + Date.now() + "-" + arquivo.name.replace(/[^a-zA-Z0-9.\-_]/g, "-");
      var referencia = firebaseInfo.storage.ref(caminho);
      await referencia.put(arquivo);
      var url = await referencia.getDownloadURL();

      var existentes = await buscarColecao(firebaseInfo.db, "galeria", null);
      var proximaOrdem = existentes.reduce(function (max, item) { return Math.max(max, item.ordem || 0); }, 0) + 1;

      await firebaseInfo.db.collection("galeria").add({
        url: url,
        alt: alt,
        ordem: proximaOrdem,
        storagePath: caminho,
        criadoEm: firebase.firestore.FieldValue.serverTimestamp(),
      });

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
    var db = window.RemopFirebase.db;
    var campo = document.getElementById("assistente-instrucoes");
    try {
      var doc = await db.collection("config").doc("assistente").get();
      campo.value = doc.exists ? doc.data().instrucoesExtras || "" : "";
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
      await window.RemopFirebase.db.collection("config").doc("assistente").set({
        instrucoesExtras: campo.value.trim(),
        atualizadoEm: firebase.firestore.FieldValue.serverTimestamp(),
      });
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

    try {
      await firebase.auth().signInWithEmailAndPassword(PAINEL_EMAIL_FIXO, pin + SUFIXO_SENHA_PIN);
    } catch (erro) {
      mostrarLogin("PIN incorreto.");
    }
  }

  function tratarSair() {
    firebase.auth().signOut();
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

    if (!window.RemopFirebase || !window.RemopFirebase.pronto || typeof firebase.auth !== "function") {
      elementos.statusLogin.textContent =
        "Firebase ainda não configurado neste ambiente — preencha assets/js/config.js (veja o README).";
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

    firebase.auth().onAuthStateChanged(function (usuario) {
      if (usuario) {
        mostrarPainel();
      } else {
        mostrarLogin();
      }
    });
  }

  document.addEventListener("DOMContentLoaded", iniciar);
})();
