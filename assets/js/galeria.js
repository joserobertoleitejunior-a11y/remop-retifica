/**
 * Galeria dinâmica: acrescenta, depois das fotos reais já fixas no HTML,
 * as fotos que a equipe adicionar pelo painel administrativo (tabela
 * "galeria" no Supabase, ordenada pela coluna "ordem").
 *
 * Se o Supabase não estiver configurado ou a tabela estiver vazia, a
 * galeria continua exatamente como está hoje — isso é só um acréscimo.
 */
(function () {
  "use strict";

  function montarFoto(foto) {
    var moldura = document.createElement("div");
    moldura.className = "foto-galeria-real moldura-tecnica";
    moldura.innerHTML =
      '<span class="canto canto--tl" aria-hidden="true"></span>' +
      '<span class="canto canto--tr" aria-hidden="true"></span>' +
      '<span class="canto canto--br" aria-hidden="true"></span>' +
      '<span class="canto canto--bl" aria-hidden="true"></span>';

    var img = document.createElement("img");
    img.src = foto.url;
    img.alt = foto.alt || "Foto da oficina Remop";
    img.loading = "lazy";
    moldura.appendChild(img);

    return moldura;
  }

  async function carregar() {
    var grade = document.querySelector(".grid-galeria-real");
    var supabaseInfo = window.RemopSupabase;
    if (!grade || !supabaseInfo || !supabaseInfo.pronto) return;

    try {
      var resultado = await supabaseInfo.client
        .from("galeria")
        .select("url, alt, ordem")
        .order("ordem", { ascending: true });
      if (resultado.error) throw resultado.error;

      (resultado.data || []).forEach(function (foto) {
        if (!foto.url) return;
        grade.appendChild(montarFoto(foto));
      });
    } catch (erro) {
      console.warn("[Remop] Não deu pra carregar fotos extras da galeria:", erro);
    }
  }

  document.addEventListener("DOMContentLoaded", carregar);
})();
