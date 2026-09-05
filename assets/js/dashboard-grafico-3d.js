/**
 * Gráfico 3D "estilo jogo" do Dashboard — Three.js real (não é CSS
 * fingindo profundidade): piso com grade, barras com luz e brilho por
 * série, câmera que o usuário arrasta/gira/dá zoom como num modelo 3D.
 *
 * A ALTURA de cada barra é o valor real, sem distorção de perspectiva —
 * o clima de jogo vem da câmera/luz/material, não de mentir sobre o
 * dado. Passar o mouse numa barra mostra a data e o valor exatos, então
 * a leitura continua confiável mesmo em 3D.
 *
 * Se o Three.js não carregar (CDN fora do ar, navegador sem WebGL), a
 * função lança erro — quem chama (admin.js) já trata isso e deixa o
 * texto de carregando visível em vez de travar o resto do dashboard.
 */
(function () {
  "use strict";

  var instanciaAtual = null;

  function corParaNumero(hex) {
    return parseInt(String(hex || "#F6C945").replace("#", "0x"), 16);
  }

  function criarInstancia(container, dados) {
    if (typeof THREE === "undefined") {
      throw new Error("THREE.js não carregou");
    }

    var opcoes = dados.opcoes || {};
    var reduzMovimento = !!opcoes.reduzMovimento;
    var largura = container.clientWidth || 600;
    var altura = container.clientHeight || 360;

    var scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0b1330);
    scene.fog = new THREE.Fog(0x0b1330, 18, 46);

    var camera = new THREE.PerspectiveCamera(45, largura / altura, 0.1, 1000);
    camera.position.set(0, 13, 20);
    camera.lookAt(0, 0, 0);

    var renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(largura, altura);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    container.innerHTML = "";
    container.appendChild(renderer.domElement);

    var piso = new THREE.Mesh(
      new THREE.PlaneGeometry(60, 60),
      new THREE.MeshStandardMaterial({ color: 0x101c46, roughness: 0.95, metalness: 0.05 })
    );
    piso.rotation.x = -Math.PI / 2;
    piso.position.y = -0.01;
    scene.add(piso);

    var grade = new THREE.GridHelper(60, 30, 0xf6c945, 0x2a3a72);
    grade.material.opacity = 0.25;
    grade.material.transparent = true;
    scene.add(grade);

    scene.add(new THREE.HemisphereLight(0x8fa2e0, 0x0b1330, 0.65));
    var luzDirecional = new THREE.DirectionalLight(0xfff2cf, 0.9);
    luzDirecional.position.set(8, 16, 10);
    scene.add(luzDirecional);
    var luzGold = new THREE.PointLight(0xf6c945, 0.6, 40);
    luzGold.position.set(-6, 8, 6);
    scene.add(luzGold);

    var controls = null;
    if (THREE.OrbitControls) {
      controls = new THREE.OrbitControls(camera, renderer.domElement);
      controls.enableDamping = true;
      controls.dampingFactor = 0.08;
      controls.minDistance = 10;
      controls.maxDistance = 34;
      controls.maxPolarAngle = Math.PI / 2.05;
      controls.enablePan = false;
      controls.autoRotate = !reduzMovimento;
      controls.autoRotateSpeed = 0.6;
    }

    var grupoBarras = new THREE.Group();
    scene.add(grupoBarras);
    var barrasPorSerie = {};

    var raycaster = new THREE.Raycaster();
    var ponteiro = new THREE.Vector2(-10, -10);
    var barraAtiva = null;

    function limparBarras() {
      grupoBarras.children.slice().forEach(function (filho) {
        grupoBarras.remove(filho);
        filho.geometry.dispose();
        filho.material.dispose();
      });
      barrasPorSerie = {};
    }

    function construirBarras(diasAtuais, series, seriesAtivas, cores, ordemSeries) {
      limparBarras();
      var totalDias = diasAtuais.length;
      var totalSeries = ordemSeries.length;
      var espacoDia = 1.4;
      var espacoSerie = 1.1;
      var larguraGrupo = (totalDias - 1) * espacoDia;
      var profundidadeGrupo = (totalSeries - 1) * espacoSerie;

      var maiorValor = 1;
      ordemSeries.forEach(function (chave) {
        (series[chave] || []).forEach(function (v) { if (v > maiorValor) maiorValor = v; });
      });

      ordemSeries.forEach(function (chave, indiceSerie) {
        var valores = series[chave] || [];
        var cor = corParaNumero(cores[chave]);
        var barras = [];
        valores.forEach(function (valor, indiceDia) {
          var alturaBarra = Math.max((valor / maiorValor) * 6, 0.05);
          var geo = new THREE.BoxGeometry(0.7, alturaBarra, 0.7);
          var mat = new THREE.MeshStandardMaterial({
            color: cor,
            emissive: cor,
            emissiveIntensity: 0.18,
            roughness: 0.35,
            metalness: 0.35,
          });
          var barra = new THREE.Mesh(geo, mat);
          barra.position.set(
            indiceDia * espacoDia - larguraGrupo / 2,
            alturaBarra / 2,
            indiceSerie * espacoSerie - profundidadeGrupo / 2
          );
          barra.userData = { chave: chave, indiceDia: indiceDia, valor: valor };
          barra.visible = !!seriesAtivas[chave];
          grupoBarras.add(barra);
          barras.push(barra);
        });
        barrasPorSerie[chave] = barras;
      });
    }

    function definirVisibilidade(chave, visivel) {
      (barrasPorSerie[chave] || []).forEach(function (barra) { barra.visible = visivel; });
    }

    var tooltip = document.createElement("div");
    tooltip.className = "admin-grafico-3d__tooltip";
    tooltip.hidden = true;
    container.appendChild(tooltip);

    function destacarBarra(barra) {
      if (barraAtiva === barra) return;
      if (barraAtiva) {
        barraAtiva.material.emissiveIntensity = 0.18;
        barraAtiva.scale.set(1, 1, 1);
      }
      barraAtiva = barra;
      if (barra) {
        barra.material.emissiveIntensity = 0.55;
        barra.scale.set(1.08, 1, 1.08);
      }
    }

    function aoMoverMouse(evento) {
      var retangulo = renderer.domElement.getBoundingClientRect();
      ponteiro.x = ((evento.clientX - retangulo.left) / retangulo.width) * 2 - 1;
      ponteiro.y = -((evento.clientY - retangulo.top) / retangulo.height) * 2 + 1;

      raycaster.setFromCamera(ponteiro, camera);
      var alvos = grupoBarras.children.filter(function (b) { return b.visible; });
      var intersecoes = raycaster.intersectObjects(alvos);

      if (!intersecoes.length) {
        destacarBarra(null);
        tooltip.hidden = true;
        return;
      }

      var barra = intersecoes[0].object;
      destacarBarra(barra);
      tooltip.hidden = false;
      tooltip.textContent = opcoes.formatarTooltip ? opcoes.formatarTooltip(barra.userData) : String(barra.userData.valor);
      tooltip.style.left = evento.clientX - retangulo.left + 14 + "px";
      tooltip.style.top = evento.clientY - retangulo.top + 10 + "px";
    }
    renderer.domElement.addEventListener("mousemove", aoMoverMouse);
    renderer.domElement.addEventListener("mouseleave", function () {
      tooltip.hidden = true;
      destacarBarra(null);
    });

    var quadroAnimacao = null;
    function animar(tempo) {
      quadroAnimacao = requestAnimationFrame(animar);
      if (controls) controls.update();
      renderer.render(scene, camera);
    }

    function pausar() {
      if (quadroAnimacao) {
        cancelAnimationFrame(quadroAnimacao);
        quadroAnimacao = null;
      }
    }
    function retomar() {
      if (!quadroAnimacao) animar();
    }
    retomar();

    function aoRedimensionar() {
      var w = container.clientWidth || largura;
      var h = container.clientHeight || altura;
      if (!w || !h) return;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    }
    window.addEventListener("resize", aoRedimensionar);

    return {
      construirBarras: construirBarras,
      definirVisibilidade: definirVisibilidade,
      pausar: pausar,
      retomar: retomar,
      destruir: function () {
        pausar();
        window.removeEventListener("resize", aoRedimensionar);
        renderer.domElement.removeEventListener("mousemove", aoMoverMouse);
        limparBarras();
        piso.geometry.dispose();
        piso.material.dispose();
        grade.geometry.dispose();
        grade.material.dispose();
        if (controls) controls.dispose();
        renderer.dispose();
        if (container.contains(renderer.domElement)) container.removeChild(renderer.domElement);
        if (container.contains(tooltip)) container.removeChild(tooltip);
      },
    };
  }

  window.RemopGrafico3D = {
    montar: function (container, dados) {
      if (instanciaAtual) {
        instanciaAtual.destruir();
        instanciaAtual = null;
      }
      instanciaAtual = criarInstancia(container, dados);
      instanciaAtual.construirBarras(dados.dias, dados.series, dados.seriesAtivas, dados.cores, dados.ordemSeries);
      return instanciaAtual;
    },
    definirVisibilidade: function (chave, visivel) {
      if (instanciaAtual) instanciaAtual.definirVisibilidade(chave, visivel);
    },
    pausar: function () {
      if (instanciaAtual) instanciaAtual.pausar();
    },
    retomar: function () {
      if (instanciaAtual) instanciaAtual.retomar();
    },
    destruir: function () {
      if (instanciaAtual) {
        instanciaAtual.destruir();
        instanciaAtual = null;
      }
    },
  };
})();
