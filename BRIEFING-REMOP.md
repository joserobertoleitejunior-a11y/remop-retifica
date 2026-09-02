# BRIEFING — Site Remop Retífica de Motores
> Handoff completo pra execução via Claude Code. Ler junto com `PADROES-AGENCIA.md` (raiz do repo).

---

## 1. Contexto do negócio

- **Nome**: Remop Retífica de Motores e Auto Peças
- **Cidade**: Itapetininga, SP
- **Endereço**: R. Av. 5 de Novembro, 1301 — Vila Nastri, Itapetininga - SP, 18207-320
- **Segmento**: Retífica de motores + autopeças + oficina mecânica (frotistas, particulares, empresas de grande porte)
- **Diferencial real**: oficina de 3-4 gerações, clientes que voltam trazendo filhos e netos, cultura de "informação como cuidado" (orientar antes de vender).
- **Presença hoje**: Instagram, Facebook, perfil no SoluTudo (com 6 recomendações reais), site próprio expirado (`remop.com.br` fora do ar).
- **Problema principal**: prova de autoridade espalhada em plataformas de terceiros, sem SEO próprio, sem conversão (tudo "A consultar", sem CTA).

---

## 2. Texto institucional — lapidado (de 1987 pra 2026)

> **Mais do que motores, construímos confiança.**
>
> A Remop nasceu para resolver um problema simples: motor com defeito precisa de quem entenda de verdade, não de quem só troca peça. Por trás de cada orçamento, cada correia trocada e cada cabeçote retificado, existe um compromisso com informação clara — porque prevenir uma dor de cabeça vale mais do que vender um serviço a mais.
>
> Isso construiu algo raro: relacionamentos de décadas. Clientes que chegaram jovens hoje trazem os filhos — alguns já trazem os netos. Não é coincidência, é resultado de fazer certo, dia após dia, sem depender de propaganda pra provar valor.
>
> Hoje seguimos evoluindo — tecnologia nova, equipe capacitada, processo mais rápido — sem abrir mão do que sempre nos diferenciou: atendimento próximo e humano. Cada motor que sai daqui funcionando carrega um pedaço dessa história.

**Frase curta pro hero:**
> "Retífica de motores em Itapetininga há gerações — clientes que confiaram trazem hoje os filhos e os netos."

---

## 3. Estrutura do site (ordem das seções)

1. **Header fixo** — logo, telefone/WhatsApp visível, botão CTA "Agendar avaliação".
2. **Hero** — frase curta + foto real do galpão/fachada + CTA duplo: "Falar no WhatsApp" e "Ver serviços".
3. **Serviços** (grid, cada um com "consultar valor" via WhatsApp pré-preenchido):
   - Retífica de Cabeçote
   - Retífica de Bielas
   - Retífica de Cilindro
   - Manutenção e retífica de virabrequim
   - Retoque e recuperação de bloco de motor
   - Serviço de usinagem para motores automotivos
   - Troca de correia dentada
**Fluxo técnico**: front chama Netlify Function → Function chama Claude (Haiku) → resposta volta pro front → botão fixo "Falar com atendente" sempre visível, com resumo pré-preenchido no link `wa.me`.

---

## 6. Domínio

- `remop.com.br` expirado (DNS_PROBE_FINISHED_NXDOMAIN). Verificar disponibilidade pra registro imediatamente.
- Alternativas: `remopretifica.com.br` / `remopmotores.com.br`.

---

## 7. Próximo passo imediato

1. Verificar/registrar domínio.
2. Repo no GitHub via Termux — feito.
3. `PADROES-AGENCIA.md` e este briefing na raiz — em andamento.
4. Passar ambos pro Claude Code como contexto inicial da sessão.
