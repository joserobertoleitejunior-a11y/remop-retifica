/**
 * Inicialização do Supabase (SDK client-side, via CDN).
 * Precisa que assets/js/config.js já tenha carregado com a URL e a
 * anon key reais do projeto Supabase preenchidas em
 * window.REMOP_CONFIG.supabase.
 */
(function () {
  "use strict";

  var config = (window.REMOP_CONFIG || {}).supabase || {};
  var configPreenchida =
    config.url &&
    config.anonKey &&
    config.url.indexOf("SUBSTITUIR") === -1 &&
    config.anonKey.indexOf("SUBSTITUIR") === -1;

  if (typeof window.supabase === "undefined" || typeof window.supabase.createClient !== "function") {
    window.RemopSupabase = { pronto: false, client: null };
    return;
  }

  if (!configPreenchida) {
    console.warn(
      "[Remop] Config do Supabase ainda não foi preenchida em assets/js/config.js — " +
        "formulário de agendamento vai usar apenas o fallback de WhatsApp."
    );
    window.RemopSupabase = { pronto: false, client: null };
    return;
  }

  window.RemopSupabase = {
    pronto: true,
    client: window.supabase.createClient(config.url, config.anonKey),
  };
})();
