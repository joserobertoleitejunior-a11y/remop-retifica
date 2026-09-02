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
assets/js/config.js            único ponto de config: WhatsApp, endpoint do bot, Supabase
assets/js/main.js              menu mobile, links de WhatsApp, modal de agendamento
assets/js/scroll-reveal.js     animações de entrada ao rolar (GSAP + ScrollTrigger)
assets/js/supabase-init.js     inicialização do Supabase (SDK client-side)
assets/js/lead-form.js         grava agendamentos no Supabase + fallback WhatsApp
assets/js/visitor-gate.js      portão de entrada — grava visitante (nome/whatsapp/carro) no Supabase
assets/js/chat-widget.js       frontend do bot (com fallback quando a function não responde)
assets/js/analytics.js         rastreamento leve: páginas vistas, cliques em CTAs e perguntas feitas ao bot
assets/js/galeria.js           acrescenta na galeria do institucional as fotos cadastradas pelo admin
assets/css/admin.css           estilos do painel administrativo
assets/js/admin.js             login + dashboard, Clientes, Galeria e Assistente IA do painel administrativo
admin.html                     painel administrativo completo (login restrito)
assets/img/                    imagens (fotos reais + placeholders — ver lista abaixo)
netlify/functions/chat-bot.js  backend do bot: chama a API da Anthropic + lê instruções extras (@supabase/supabase-js)
netlify.toml                   config de deploy pro Netlify (pronta, ainda não ativa)
package.json                   só a dependência @supabase/supabase-js, usada pela function do bot
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
   - `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY` — opcionais, só se for
     usar o editor de "Instruções extras" do assistente (ver seção do
     painel admin abaixo). A service role key fica só no backend, nunca
     no frontend — ela ignora as políticas de RLS.
4. Criar um projeto em [supabase.com](https://supabase.com) (plano
   gratuito é suficiente pra começar).
5. Rodar o schema abaixo no **SQL Editor** do Supabase — cria as tabelas e
   já deixa o RLS (Row Level Security) configurado do jeito certo:
   `agendamentos`, `visitantes`, `paginas_vistas`, `cliques` e
   `perguntas_ia` recebem escrita pública (o site grava sem estar logado)
   e leitura só autenticada — nunca deixe a leitura pública dessas
   tabelas, são a base de leads/clientes e analytics. `galeria` e
   `config_assistente` (usadas pelo painel admin) são o oposto: leitura
   pública (o site precisa ler pra mostrar a galeria e as instruções do
   assistente sem estar logado), escrita só autenticada:
   ```sql
   -- Tabelas
   create table visitantes (
     id bigint generated always as identity primary key,
     nome text not null,
     whatsapp text not null,
     modelo_carro text default '',
     ano_carro text default '',
     origem text default '',
     pagina text default '',
     criado_em timestamptz not null default now()
   );

   create table agendamentos (
     id bigint generated always as identity primary key,
     nome text not null,
     telefone text not null,
     servico text default '',
     mensagem text default '',
     origem text default '',
     status text default 'novo',
     pagina text default '',
     criado_em timestamptz not null default now()
   );

   create table paginas_vistas (
     id bigint generated always as identity primary key,
     pagina text default '',
     referencia text default '',
     visitante_id text default '',
     criado_em timestamptz not null default now()
   );

   create table cliques (
     id bigint generated always as identity primary key,
     tipo text default '',
     detalhe text default '',
     pagina text default '',
     visitante_id text default '',
     criado_em timestamptz not null default now()
   );

   create table perguntas_ia (
     id bigint generated always as identity primary key,
     texto text default '',
     pagina text default '',
     visitante_id text default '',
     criado_em timestamptz not null default now()
   );

   create table galeria (
     id bigint generated always as identity primary key,
     url text not null,
     alt text default '',
     ordem integer default 0,
     storage_path text default '',
     criado_em timestamptz not null default now()
   );

   create table config_assistente (
     id integer primary key,
     instrucoes_extras text default '',
     atualizado_em timestamptz not null default now()
   );

   -- RLS: leads/analytics — escrita pública, leitura só autenticada
   alter table visitantes enable row level security;
   alter table agendamentos enable row level security;
   alter table paginas_vistas enable row level security;
   alter table cliques enable row level security;
   alter table perguntas_ia enable row level security;

   create policy "criacao publica" on visitantes for insert to anon with check (true);
   create policy "leitura autenticada" on visitantes for select to authenticated using (true);

   create policy "criacao publica" on agendamentos for insert to anon with check (true);
   create policy "leitura autenticada" on agendamentos for select to authenticated using (true);

   create policy "criacao publica" on paginas_vistas for insert to anon with check (true);
   create policy "leitura autenticada" on paginas_vistas for select to authenticated using (true);

   create policy "criacao publica" on cliques for insert to anon with check (true);
   create policy "leitura autenticada" on cliques for select to authenticated using (true);

   create policy "criacao publica" on perguntas_ia for insert to anon with check (true);
   create policy "leitura autenticada" on perguntas_ia for select to authenticated using (true);

   -- RLS: galeria/config do painel admin — leitura pública, escrita só autenticada
   alter table galeria enable row level security;
   alter table config_assistente enable row level security;

   create policy "leitura publica" on galeria for select using (true);
   create policy "escrita autenticada" on galeria for all to authenticated using (true) with check (true);

   create policy "leitura publica" on config_assistente for select using (true);
   create policy "escrita autenticada" on config_assistente for all to authenticated using (true) with check (true);
   ```
6. Em **Storage**, criar um bucket chamado `galeria` com a opção
   **Public bucket** ativada (assim as fotos abrem direto pela URL
   pública, sem precisar de token). Depois, no **SQL Editor**, aplicar as
   políticas que restringem quem pode enviar/remover foto (a leitura já é
   pública por causa do bucket):
   ```sql
   create policy "upload autenticado galeria" on storage.objects
     for insert to authenticated with check (bucket_id = 'galeria');
   create policy "remocao autenticada galeria" on storage.objects
     for delete to authenticated using (bucket_id = 'galeria');
   ```
7. Preencher a config pública do Supabase em `assets/js/config.js`
   (`window.REMOP_CONFIG.supabase.url` e `.anonKey`) com os valores reais
   do projeto — pegue em **Project Settings → API**. A anon key não é
   segredo (é feita pra ficar exposta no navegador); a segurança é
   garantida pelas políticas de RLS acima, não por escondê-la.
8. Conectar o domínio real (`remopretifica.com.br` ou equivalente) em
   **Domain settings** do Netlify.
9. Depois de migrar, atualizar `robots.txt`, `sitemap.xml` e as tags
   `canonical`/Open Graph em `index.html` para usar o domínio final em vez
   da URL do GitHub Pages.

Nenhuma chave real deve ser colocada em código — a function já usa
`process.env.ANTHROPIC_API_KEY`, `process.env.SUPABASE_URL` e
`process.env.SUPABASE_SERVICE_ROLE_KEY` sem valor hardcoded.

## Painel administrativo (`admin.html`)

Painel completo, protegido por login, com quatro abas:

- **Dashboard** — visitantes do portão, agendamentos, cliques nos principais
  CTAs (com uma tabela de cliques agrupados por página) e perguntas feitas
  ao bot, tudo com dados reais do Supabase.
- **Clientes** — tabela completa de agendamentos e de visitantes do portão
  (todos os campos: nome, WhatsApp/telefone, carro, serviço, mensagem,
  status, página, data), com busca por nome.
- **Galeria** — upload de fotos (Supabase Storage) que aparecem
  automaticamente na galeria da página Institucional, e remoção das fotos
  já cadastradas.
- **Assistente IA** — campo de texto livre com instruções extras que se
  somam ao roteiro fixo do bot (tom de voz, destacar uma promoção etc.),
  salvas no Supabase e lidas pela Netlify Function a cada conversa.

Setup manual (uma vez só):

1. No **Supabase → Authentication → Users**, clicar em **Add user** pra
   criar o login de quem vai acessar o painel — não existe cadastro
   público, só esse usuário criado manualmente consegue entrar. O login
   da equipe é só um PIN numérico (`assets/js/admin.js`), mas o Supabase
   por baixo dos panos exige um e-mail e uma senha de pelo menos 6
   caracteres — então cadastre:
   - **E-mail**: `painel@remop-retifica.internal`
   - **Senha**: o PIN + o sufixo fixo que está em `SUFIXO_SENHA_PIN` no
     topo de `assets/js/admin.js`. Com o PIN padrão `5786` e o sufixo
     padrão do código, a senha a cadastrar é `5786-RemopPainel2026!`.
   - Marcar **Auto Confirm User** ao criar (senão o Supabase espera
     confirmação por e-mail, e esse e-mail interno não existe de verdade).
   - Pra trocar o PIN: mude o que a equipe digita, sem mexer em código —
     é só editar a senha desse usuário no Supabase com um valor novo
     terminando no mesmo sufixo (ex.: PIN `1234` → senha
     `1234-RemopPainel2026!`).
2. Já ter rodado o schema SQL e as políticas de RLS/Storage dos passos 5
   e 6 acima — sem isso o dashboard carrega vazio mesmo logado, e a
   galeria/assistente não funcionam.
3. Só para o editor de instruções do assistente: em **Project Settings →
   API**, copiar a **service_role key** (é secreta — nunca vai no
   frontend). No Netlify, colar essa chave na variável de ambiente
   `SUPABASE_SERVICE_ROLE_KEY`, e a URL do projeto em `SUPABASE_URL`.
   Sem essas variáveis, o bot funciona normalmente — só ignora as
   instruções extras.

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
