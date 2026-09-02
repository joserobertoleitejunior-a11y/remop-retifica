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
assets/js/galeria.js           acrescenta na galeria do institucional as fotos cadastradas pelo admin
assets/css/admin.css           estilos do painel administrativo
assets/js/admin.js             login + dashboard, Clientes, Galeria e Assistente IA do painel administrativo
admin.html                     painel administrativo completo (login restrito)
assets/img/                    imagens (fotos reais + placeholders — ver lista abaixo)
netlify/functions/chat-bot.js  backend do bot: chama a API da Anthropic + lê instruções extras (firebase-admin)
netlify.toml                   config de deploy pro Netlify (pronta, ainda não ativa)
package.json                   só a dependência firebase-admin, usada pela function do bot
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
   - `FIREBASE_SERVICE_ACCOUNT` — opcional, só se for usar o editor de
     "Instruções extras" do assistente (ver seção do painel admin abaixo).
4. Preencher a config pública do Firebase em `assets/js/config.js`
   (`window.REMOP_CONFIG.firebase`) com os valores reais do projeto Firebase
   — não é segredo, mas precisa ser o projeto certo.
5. Configurar as regras do Firestore. `agendamentos`, `visitantes`,
   `paginas_vistas`, `cliques` e `perguntas_ia` continuam com `create`
   público (o site grava sem estar logado) e `read`/`update`/`delete` só
   para autenticado — nunca deixe a leitura pública dessas coleções, são a
   base de leads/clientes e analytics. `galeria` e `config` (usadas pelo
   painel admin) são o oposto: `read` público (o site precisa ler pra
   mostrar a galeria e as instruções do assistente sem estar logado), mas
   só o admin autenticado pode escrever:
   ```
   match /agendamentos/{doc}   { allow create: if true; allow read: if request.auth != null; allow update, delete: if false; }
   match /visitantes/{doc}     { allow create: if true; allow read: if request.auth != null; allow update, delete: if false; }
   match /paginas_vistas/{doc} { allow create: if true; allow read: if request.auth != null; allow update, delete: if false; }
   match /cliques/{doc}        { allow create: if true; allow read: if request.auth != null; allow update, delete: if false; }
   match /perguntas_ia/{doc}   { allow create: if true; allow read: if request.auth != null; allow update, delete: if false; }
   match /galeria/{doc}        { allow read: if true; allow write: if request.auth != null; }
   match /config/{doc}         { allow read: if true; allow write: if request.auth != null; }
   ```
6. Configurar as regras do Firebase Storage (upload de fotos da galeria) —
   leitura pública, escrita só autenticada:
   ```
   match /galeria/{arquivo} { allow read: if true; allow write: if request.auth != null; }
   ```
7. Conectar o domínio real (`remopretifica.com.br` ou equivalente) em
   **Domain settings**.
8. Depois de migrar, atualizar `robots.txt`, `sitemap.xml` e as tags
   `canonical`/Open Graph em `index.html` para usar o domínio final em vez
   da URL do GitHub Pages.

Nenhuma chave real deve ser colocada em código — a function já usa
`process.env.ANTHROPIC_API_KEY` e `process.env.FIREBASE_SERVICE_ACCOUNT`
sem valor hardcoded.

## Painel administrativo (`admin.html`)

Painel completo, protegido por login, com quatro abas:

- **Dashboard** — visitantes do portão, agendamentos, cliques nos principais
  CTAs (com uma tabela de cliques agrupados por página) e perguntas feitas
  ao bot, tudo com dados reais do Firestore.
- **Clientes** — tabela completa de agendamentos e de visitantes do portão
  (todos os campos: nome, WhatsApp/telefone, carro, serviço, mensagem,
  status, página, data), com busca por nome.
- **Galeria** — upload de fotos (Firebase Storage) que aparecem
  automaticamente na galeria da página Institucional, e remoção das fotos
  já cadastradas.
- **Assistente IA** — campo de texto livre com instruções extras que se
  somam ao roteiro fixo do bot (tom de voz, destacar uma promoção etc.),
  salvas no Firestore e lidas pela Netlify Function a cada conversa.

Setup manual (uma vez só):

1. No **Firebase Console → Authentication → Sign-in method**, habilitar o
   provedor **E-mail/senha**.
2. Em **Authentication → Users → Add user**, criar o login de quem vai
   acessar o painel (e-mail + senha) — não existe cadastro público, só
   esse usuário criado manualmente consegue entrar.
3. Aplicar as regras do Firestore e do Storage dos passos 5 e 6 acima —
   sem isso o dashboard carrega vazio mesmo logado, e a galeria/assistente
   não funcionam.
4. Só para o editor de instruções do assistente: em **Firebase Console →
   Configurações do projeto → Contas de serviço**, gerar uma nova chave
   privada (baixa um `.json`). No Netlify, colar o conteúdo inteiro desse
   arquivo (JSON em uma linha só) na variável de ambiente
   `FIREBASE_SERVICE_ACCOUNT`. Sem essa variável, o bot funciona
   normalmente — só ignora as instruções extras.

CRUD de serviços/profissionais ainda não foi construído (ver
`BRIEFING-REMOP.md`/backlog do projeto).

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
