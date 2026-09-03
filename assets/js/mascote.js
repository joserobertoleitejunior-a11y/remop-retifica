(function () {
  "use strict";

  var MENSAGENS_POR_PAGINA = {
    "index.html": {
      saudacao: "Oi, eu sou o Seu Remo! Bem-vindo à Remop.",
      texto: "Se o motor tá dando problema, comece vendo nossos serviços logo abaixo, ou clique no ícone de chat pra fazer um diagnóstico rápido comigo."
    },
    "": {
      saudacao: "Oi, eu sou o Seu Remo! Bem-vindo à Remop.",
      texto: "Se o motor tá dando problema, comece vendo nossos serviços logo abaixo, ou clique no ícone de chat pra fazer um diagnóstico rápido comigo."
    },
    "institucional.html": {
      saudacao: "Aqui é a nossa história.",
      texto: "A Remop existe desde 1989, aqui em Itapetininga — já são gerações de clientes que confiaram na gente e hoje trazem os filhos e netos pra cá."
    },
    "localizacao.html": {
      saudacao: "Precisa chegar até nós?",
      texto: "Aqui embaixo tem o endereço, o mapa e o horário de atendimento. Se preferir, chama a gente direto no WhatsApp."
    }
  };

  function nomeArquivoAtual() {
    var partes = location.pathname.split("/");
    return partes[partes.length - 1] || "";
  }

  function montarWidget() {
    var config = MENSAGENS_POR_PAGINA[nomeArquivoAtual()] || MENSAGENS_POR_PAGINA["index.html"];

    var raiz = document.createElement("div");
    raiz.className = "mascote-guia";
    raiz.setAttribute("data-mascote-guia", "");

    raiz.innerHTML =
      '<div class="mascote-guia__balao" data-mascote-balao hidden>' +
        '<button class="mascote-guia__fechar" type="button" data-mascote-fechar aria-label="Fechar">&times;</button>' +
        '<strong>' + config.saudacao + '</strong>' +
        '<p>' + config.texto + '</p>' +
      '</div>' +
      '<button class="mascote-guia__botao" type="button" data-mascote-botao aria-label="Abrir dica do assistente">' +
        '<img src="assets/img/mascote-remop.png" alt="Assistente da Remop" width="90" height="165">' +
      '</button>';

    document.body.appendChild(raiz);

    var balao = raiz.querySelector("[data-mascote-balao]");
    var botao = raiz.querySelector("[data-mascote-botao]");
    var fechar = raiz.querySelector("[data-mascote-fechar]");

    function abrirBalao() { balao.hidden = false; }
    function fecharBalao() { balao.hidden = true; }

    botao.addEventListener("click", function () {
      if (balao.hidden) { abrirBalao(); } else { fecharBalao(); }
    });
    fechar.addEventListener("click", function (evento) {
      evento.stopPropagation();
      fecharBalao();
    });

    setTimeout(function () {
      raiz.classList.add("mascote-guia--entrou");
      abrirBalao();
      setTimeout(fecharBalao, 7000);
    }, 900);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", montarWidget);
  } else {
    montarWidget();
  }
})();
