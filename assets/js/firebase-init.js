/**
 * Inicialização do Firebase (SDK client-side, via CDN compat).
 * Precisa que assets/js/config.js já tenha carregado com as credenciais
 * reais do projeto Firebase preenchidas em window.REMOP_CONFIG.firebase.
 */
(function () {
  "use strict";

  var config = (window.REMOP_CONFIG || {}).firebase || {};
  var configPreenchida = Object.keys(config).every(function (chave) {
    return config[chave] && config[chave].indexOf("SUBSTITUIR") === -1;
  });

  if (typeof firebase === "undefined") {
    window.RemopFirebase = { pronto: false, db: null };
    return;
  }

  if (!configPreenchida) {
    console.warn(
      "[Remop] Config do Firebase ainda não foi preenchida em assets/js/config.js — " +
        "formulário de agendamento vai usar apenas o fallback de WhatsApp."
    );
    window.RemopFirebase = { pronto: false, db: null };
    return;
  }

  firebase.initializeApp(config);
  window.RemopFirebase = { pronto: true, db: firebase.firestore() };
})();
