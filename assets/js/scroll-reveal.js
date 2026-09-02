/**
 * Animações de entrada ao rolar a página (GSAP + ScrollTrigger),
 * conforme o padrão de motion da agência (PADROES-AGENCIA.md §2):
 * GSAP/ScrollTrigger para narrativa de scroll e transição de seção.
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
              toggleActions: "play none none none",
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
          toggleActions: "play none none none",
        },
      });
    });
  }

  document.addEventListener("DOMContentLoaded", function () {
    // Cabeçalhos de seção (eyebrow + título + subtítulo)
    revelarAoRolar(".eyebrow", { y: 14, duration: 0.5 });
    revelarAoRolar(".secao__titulo, .vitrine__conteudo h2");
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

    // Entrada da hero, direto ao carregar (sem depender de scroll)
    gsap
      .timeline({ defaults: { ease: "power2.out" } })
      .from(".hero__conteudo .eyebrow", { opacity: 0, y: 16, duration: 0.5 })
      .from(
        ".hero__frase-curta",
        { opacity: 0, y: 24, duration: 0.6 },
        "-=0.25"
      )
      .from(".hero__texto", { opacity: 0, y: 18, duration: 0.5 }, "-=0.3")
      .from(
        ".hero__ctas .botao",
        { opacity: 0, y: 14, duration: 0.45, stagger: 0.1 },
        "-=0.25"
      );
  });
})();
