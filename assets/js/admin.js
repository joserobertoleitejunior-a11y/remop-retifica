/**
 * Painel administrativo — login (Firebase Auth) + dashboard (Chart.js)
 * com dados reais das coleções que assets/js/analytics.js, visitor-gate.js
 * e lead-form.js já gravam no Firestore.
 *
 * Pré-requisito (feito uma vez, fora do código): criar um usuário em
 * Firebase Console → Authentication → Add user, e ajustar as regras do
 * Firestore pra permitir leitura autenticada nas coleções abaixo (ver
 * README.md).
 */
(function () {
  "use strict";

  var CORES = {
    visitantes: "#1E2E63",
    agendamentos: "#1f8a4c",
    cliques: "#D9A916",
    perguntas: "#c0392b",
  };

  var elementos = {};
  var grafico = null;
  var seriesAtivas = { visitantes: true, agendamentos: true, cliques: true, perguntas: true };

  function formatarDataCurta(data) {
    return data.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
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
    var snap = await db.collection(nome).where("criadoEm", ">=", desde).get();
    return snap.docs.map(function (doc) { return doc.data(); });
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

    docs
      .slice()
      .sort(function (a, b) {
        var ta = a.criadoEm && a.criadoEm.toDate ? a.criadoEm.toDate().getTime() : 0;
        var tb = b.criadoEm && b.criadoEm.toDate ? b.criadoEm.toDate().getTime() : 0;
        return tb - ta;
      })
      .slice(0, 25)
      .forEach(function (doc) {
        var quando = doc.criadoEm && doc.criadoEm.toDate ? doc.criadoEm.toDate().toLocaleString("pt-BR") : "–";
        var tr = document.createElement("tr");

        var tdQuando = document.createElement("td");
        tdQuando.textContent = quando;
        var tdPagina = document.createElement("td");
        tdPagina.textContent = doc.pagina || "–";
        var tdTexto = document.createElement("td");
        tdTexto.textContent = doc.texto || "";

        tr.appendChild(tdQuando);
        tr.appendChild(tdPagina);
        tr.appendChild(tdTexto);
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

  function mostrarPainel() {
    elementos.login.hidden = true;
    elementos.painel.hidden = false;
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
    }
  }

  async function tratarLogin(evento) {
    evento.preventDefault();
    var email = elementos.formLogin.email.value.trim();
    var senha = elementos.formLogin.senha.value;

    elementos.statusLogin.textContent = "Entrando...";
    elementos.statusLogin.className = "mensagem-status";

    try {
      await firebase.auth().signInWithEmailAndPassword(email, senha);
    } catch (erro) {
      mostrarLogin("E-mail ou senha inválidos.");
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
