/**
 * Animações de entrada ao rolar a página (GSAP + ScrollTrigger),
 * conforme o padrão de motion da agência (PADROES-AGENCIA.md §2):
 * GSAP/ScrollTrigger para narrativa de scroll e transição de seção.
 *
 * Os títulos principais usam um efeito de "montagem": as letras entram
 * vindo da esquerda, em ordem, uma única vez, quando o título chega
 * perto da tela — sem desmontar de novo, pra nunca sumir sozinho.
 *
 * Respeita prefers-reduced-motion: quando ativo, os elementos aparecem
 * direto, sem nenhuma animação.
 */
(function () {
  "use strict";

  var reduzMovimento = window.matchMedia(
    "(prefers-reduced-motion: reduce)"
  ).matches;

  if (typeof gsap === "undefined" || reduzMovimento) return;

  gsap.registerPlugin(ScrollTrigger);

  /**
   * Quebra o texto de um título em letras (dentro de palavras, pra não
   * perder a quebra de linha natural). O texto real continua acessível
   * via aria-label; as letras viram decoração (aria-hidden).
   */
  function dividirEmLetras(elemento) {
    var textoOriginal = elemento.textContent.trim();
    elemento.setAttribute("aria-label", textoOriginal);
    elemento.innerHTML = "";

    var palavras = textoOriginal.split(" ");
    palavras.forEach(function (palavra, indice) {
      var spanPalavra = document.createElement("span");
      spanPalavra.className = "palavra-montavel";
      spanPalavra.setAttribute("aria-hidden", "true");

      palavra.split("").forEach(function (letra) {
        var spanLetra = document.createElement("span");
        spanLetra.className = "letra-montavel";
        spanLetra.textContent = letra;
        spanPalavra.appendChild(spanLetra);
      });

      elemento.appendChild(spanPalavra);
      if (indice < palavras.length - 1) {
        elemento.appendChild(document.createTextNode(" "));
      }
    });

    return elemento.querySelectorAll(".letra-montavel");
  }

  /**
   * Título entra vindo da esquerda (letra a letra, em ordem) quando o
   * elemento chega perto da tela. Toca uma única vez (sem scrub, sem
   * desmontagem na saída) — assim o texto nunca fica "preso" a um
   * cálculo de progresso que pode já nascer parcial (ex.: título logo
   * abaixo do cabeçalho, que já está perto do topo da tela no load).
   */
  function montarDesmontarAoRolar(seletor) {
    var elementos = gsap.utils.toArray(seletor);
    elementos.forEach(function (elemento) {
      var letras = dividirEmLetras(elemento);
      if (!letras.length) return;

      gsap.from(letras, {
        x: -60,
        opacity: 0,
        ease: "power2.out",
        duration: 0.6,
        stagger: 0.02,
        scrollTrigger: {
          trigger: elemento,
          start: "top 90%",
          once: true,
        },
      });
    });
  }

  function revelarAoRolar(seletor, opcoes) {
    var elementos = gsap.utils.toArray(seletor);
    if (!elementos.length) return;

    elementos.forEach(function (elemento) {
      gsap.from(
        elemento,
        Object.assign(
          {
            opacity: 0,
            y: 32,
            duration: 0.7,
            ease: "power2.out",
            scrollTrigger: {
              trigger: elemento,
              start: "top 88%",
              once: true,
            },
          },
          opcoes || {}
        )
      );
    });
  }

  function revelarGrupoAoRolar(seletorContainer, seletorItens) {
    var containers = gsap.utils.toArray(seletorContainer);
    containers.forEach(function (container) {
      var itens = container.querySelectorAll(seletorItens);
      if (!itens.length) return;
      gsap.from(itens, {
        opacity: 0,
        y: 28,
        duration: 0.6,
        ease: "power2.out",
        stagger: 0.1,
        scrollTrigger: {
          trigger: container,
          start: "top 85%",
          once: true,
        },
      });
    });
  }

  document.addEventListener("DOMContentLoaded", function () {
    // Títulos principais — efeito de montagem/desmontagem por letra
    montarDesmontarAoRolar(
      ".hero__frase-curta, .secao__titulo, .vitrine__conteudo h2, .localizacao__grid h2"
    );

    // Eyebrow e parágrafos de apoio — revelação simples (sem quebrar em letra)
    revelarAoRolar(".eyebrow", { y: 14, duration: 0.5 });
    revelarAoRolar(".secao__subtitulo, .vitrine__conteudo p");

    // Grupos de cards/itens — revelam em sequência (stagger)
    revelarGrupoAoRolar(".grid-servicos", ".card-servico");
    revelarGrupoAoRolar(".grid-diferenciais", ".item-diferencial");
    revelarGrupoAoRolar(".grid-depoimentos", ".card-depoimento");
    revelarGrupoAoRolar(".lista-facilidades", "li");
    revelarGrupoAoRolar(".grid-pagamento", ".chip-pagamento");
    revelarGrupoAoRolar(".grid-galeria-real", ".foto-galeria-real");
    revelarGrupoAoRolar(".selos-plataformas", ".selo-plataforma");

    // Fotos de destaque
    revelarAoRolar(".diferenciais__foto", { x: 24, y: 0, duration: 0.8 });
    revelarAoRolar(".vitrine__carro", { scale: 0.92, y: 0, duration: 0.8 });
    revelarAoRolar(".localizacao__mapa", { x: -24, y: 0, duration: 0.8 });
    revelarAoRolar(".localizacao__info", { x: 24, y: 0, duration: 0.8 });

    // Foto de fundo da hero desfoca e desaparece conforme desce o
    // scroll (preso à posição — sobe de novo se o visitante voltar).
    var heroFoto = document.querySelector(".hero__foto");
    if (heroFoto) {
      gsap.to(heroFoto, {
        opacity: 0.15,
        filter: "blur(18px)",
        scale: 1.12,
        ease: "none",
        scrollTrigger: {
          trigger: ".hero",
          start: "top top",
          end: "bottom top",
          scrub: 0.4,
        },
      });
    }

    // Entrada da hero, direto ao carregar (sem depender de scroll) —
    // o título já foi tratado por montarDesmontarAoRolar acima.
    gsap
      .timeline({ defaults: { ease: "power2.out" } })
      .from(".hero__conteudo .eyebrow", { opacity: 0, y: 16, duration: 0.5 })
      .from(".hero__texto", { opacity: 0, y: 18, duration: 0.5 }, "-=0.1")
      .from(
        ".hero__ctas .botao",
        { opacity: 0, y: 14, duration: 0.45, stagger: 0.1 },
        "-=0.25"
      );

    /**
     * gsap.from() já deixa cada elemento invisível (opacity:0) assim que
     * o ScrollTrigger é criado, esperando o scroll cruzar a posição
     * calculada naquele momento. Só que imagens (galeria, vitrine, fotos
     * de destaque) ainda estão carregando e vão empurrar o layout pra
     * baixo depois — a posição calculada fica desatualizada e o
     * elemento pode nunca "cruzar" o gatilho, ficando invisível pra
     * sempre (era isso que travava o texto). Recalcula tudo assim que
     * as imagens e as fontes terminarem de carregar.
     */
    window.addEventListener("load", function () {
      ScrollTrigger.refresh();
    });
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(function () {
        ScrollTrigger.refresh();
      });
    }
  });
})();
