# Remop Retífica de Motores e Auto Peças — Site institucional

Site estático (HTML/CSS/JS puro, sem build/bundler) da Remop, Itapetininga-SP.
Projeto da agência **Vibe Coding Process**. Contratos do projeto: veja
`PADROES-AGENCIA.md` e `BRIEFING-REMOP.md` na raiz.

## Estrutura

```
index.html                     10 seções do site (ver BRIEFING-REMOP.md §3)
assets/css/style.css           estilos gerais, mobile-first
assets/css/chat-widget.css     estilos do widget de atendimento
assets/js/config.js            único ponto de config: WhatsApp, endpoint do bot, Firebase
assets/js/main.js              menu mobile, links de WhatsApp, modal de agendamento
assets/js/firebase-init.js     inicialização do Firebase (SDK client-side)
assets/js/lead-form.js         grava agendamentos no Firestore + fallback WhatsApp
assets/js/chat-widget.js       frontend do bot (com fallback quando a function não responde)
assets/img/                    imagens (placeholders nomeados — ver lista abaixo)
netlify/functions/chat-bot.js  backend do bot: chama a API da Anthropic (server-side)
netlify.toml                   config de deploy pro Netlify (pronta, ainda não ativa)
.env.example                   variáveis necessárias (nunca commitar .env real)
robots.txt / sitemap.xml       SEO técnico
```

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
5. Configurar as regras do Firestore para a coleção `agendamentos` (permitir
   `create` público, bloquear `read`/`update`/`delete` público).
6. Conectar o domínio real (`remopretifica.com.br` ou equivalente) em
   **Domain settings**.
7. Depois de migrar, atualizar `robots.txt`, `sitemap.xml` e as tags
   `canonical`/Open Graph em `index.html` para usar o domínio final em vez
   da URL do GitHub Pages.

Nenhuma chave real deve ser colocada em código — a function já usa
`process.env.ANTHROPIC_API_KEY` sem valor hardcoded.

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
