# Remop Retífica de Motores e Auto Peças — Site institucional

Site estático (HTML/CSS/JS puro, sem build/bundler) da Remop, Itapetininga-SP.
Projeto da agência **Vibe Coding Process**. Contratos do projeto: veja
`PADROES-AGENCIA.md` e `BRIEFING-REMOP.md` na raiz.

## Estrutura

```
index.html                     home: hero, garagem (vitrine) e serviços
institucional.html             diferenciais, prova social e facilidades
localizacao.html                endereço/mapa/horário e formas de pagamento

assets/css/style.css           estilos gerais, mobile-first
assets/css/chat-widget.css     estilos do widget de atendimento
assets/js/config.js            único ponto de config: WhatsApp, endpoint do bot, Firebase
assets/js/main.js              menu mobile, links de WhatsApp, modal de agendamento
assets/js/scroll-reveal.js     animações de entrada ao rolar (GSAP + ScrollTrigger)
assets/js/firebase-init.js     inicialização do Firebase (SDK client-side)
assets/js/lead-form.js         grava agendamentos no Firestore + fallback WhatsApp
assets/js/visitor-gate.js      portão de entrada — grava visitante (nome/whatsapp/carro) no Firestore
assets/js/chat-widget.js       frontend do bot (com fallback quando a function não responde)
assets/js/analytics.js         rastreamento leve: páginas vistas, cliques em CTAs e perguntas feitas ao bot
assets/css/admin.css           estilos do painel administrativo
assets/js/admin.js             login (Firebase Auth) + dashboard (Chart.js) do painel administrativo
admin.html                     painel administrativo — dashboard com dados reais (login restrito)
assets/img/                    imagens (fotos reais + placeholders — ver lista abaixo)
netlify/functions/chat-bot.js  backend do bot: chama a API da Anthropic (server-side)
netlify.toml                   config de deploy pro Netlify (pronta, ainda não ativa)
.env.example                   variáveis necessárias (nunca commitar .env real)
robots.txt / sitemap.xml       SEO técnico (as 3 páginas listadas)
```

Header, footer, portão de entrada, chat, modal de agendamento e a lista de
scripts são idênticos nas 3 páginas HTML — é site estático sem build, então
qualquer alteração nesses blocos precisa ser replicada manualmente nas 3
(compartilhamento por duplicação é o trade-off aceito de não ter bundler).

## Fase atual: GitHub Pages

O site funciona hoje 100% estático no GitHub Pages. O widget de chat detecta
que `/.netlify/functions/chat-bot` não existe e cai automaticamente no
fallback: mensagem amigável + botão direto pro WhatsApp humano. Isso é
esperado — GitHub Pages não executa backend.

## Fase seguinte: migração pro Netlify

Checklist manual no painel do Netlify (nenhuma dessas etapas está automatizada
por código — são ações de configuração no painel):

1. Criar o site no Netlify apontando pra este repositório GitHub.
2. Confirmar build settings: publish directory `.`, functions directory
   `netlify/functions` (já configurado em `netlify.toml`).
3. Em **Site settings → Environment variables**, adicionar:
   - `ANTHROPIC_API_KEY` — chave real da API da Anthropic.
4. Preencher a config pública do Firebase em `assets/js/config.js`
   (`window.REMOP_CONFIG.firebase`) com os valores reais do projeto Firebase
   — não é segredo, mas precisa ser o projeto certo.
5. Configurar as regras do Firestore para as coleções `agendamentos`,
   `visitantes`, `paginas_vistas`, `cliques` e `perguntas_ia`: `create`
   público (o site grava sem estar logado), mas `read`/`update`/`delete`
   só para quem estiver autenticado (o painel admin) — nunca deixe a
   leitura pública dessas coleções, são a base de leads/clientes e
   analytics. Exemplo de regra:
   ```
   match /agendamentos/{doc}   { allow create: if true; allow read: if request.auth != null; allow update, delete: if false; }
   match /visitantes/{doc}     { allow create: if true; allow read: if request.auth != null; allow update, delete: if false; }
   match /paginas_vistas/{doc} { allow create: if true; allow read: if request.auth != null; allow update, delete: if false; }
   match /cliques/{doc}        { allow create: if true; allow read: if request.auth != null; allow update, delete: if false; }
   match /perguntas_ia/{doc}   { allow create: if true; allow read: if request.auth != null; allow update, delete: if false; }
   ```
6. Conectar o domínio real (`remopretifica.com.br` ou equivalente) em
   **Domain settings**.
7. Depois de migrar, atualizar `robots.txt`, `sitemap.xml` e as tags
   `canonical`/Open Graph em `index.html` para usar o domínio final em vez
   da URL do GitHub Pages.

Nenhuma chave real deve ser colocada em código — a function já usa
`process.env.ANTHROPIC_API_KEY` sem valor hardcoded.

## Painel administrativo (`admin.html`)

Dashboard com dados reais (visitantes do portão, agendamentos, cliques nos
principais CTAs e perguntas feitas ao bot), protegido por login. Setup
manual (uma vez só):

1. No **Firebase Console → Authentication → Sign-in method**, habilitar o
   provedor **E-mail/senha**.
2. Em **Authentication → Users → Add user**, criar o login de quem vai
   acessar o painel (e-mail + senha) — não existe cadastro público, só
   esse usuário criado manualmente consegue entrar.
3. Aplicar as regras do Firestore do passo 5 acima (`read` só para
   autenticado) — sem isso o dashboard carrega vazio mesmo logado.

O restante do painel (CRUD de serviços/profissionais, galeria de fotos,
comportamento da IA) ainda não foi construído — só o dashboard existe até
agora.

## Imagens pendentes (fotos reais)

Os arquivos abaixo são placeholders SVG claramente identificados. Substituir
por fotos reais (JPG/WebP) mantendo os mesmos nomes de arquivo, ou trocando a
referência em `index.html`:

- `assets/img/hero-fachada-remop-PLACEHOLDER.svg` — foto da fachada/galpão (hero)
- `assets/img/oficina-interna-remop-PLACEHOLDER.svg` — foto interna da oficina/bancada
- `assets/img/equipe-remop-PLACEHOLDER.svg` — foto da equipe
- `assets/img/og-image-remop-PLACEHOLDER.svg` — imagem de compartilhamento (recomendado
  substituir por JPG/PNG real de 1200×630px — várias redes sociais não renderizam SVG em OG image)
- `assets/img/logo-remop.svg` — logo provisório; substituir pelo logo oficial se houver
