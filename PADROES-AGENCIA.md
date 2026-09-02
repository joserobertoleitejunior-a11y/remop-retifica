# PADRÕES-AGENCIA.md
### VIBE CODING PROCESS — arquivo mestre de padrões
> Criado por José. Define as regras fixas que **todo projeto novo** da agência segue, independente do cliente, do stack específico ou de qual agente/modelo de IA está executando o código.
>
> **Como usar**: cole este arquivo na raiz de todo projeto novo (`PADROES-AGENCIA.md`) e referencie ele no início de qualquer sessão de execução — humana ou de IA. É o "contrato" que qualquer agente deve respeitar sem precisar ser lembrado toda vez. Se um agente de IA sugerir algo que contradiz este arquivo, este arquivo vence.

---

## 0. Contexto do projeto
---

## 1–9. Regras fixas

Todas as seções 1 a 9 do padrão mestre da agência (governança/versionamento, motion e loading, observabilidade/qualidade/testes, segurança, acessibilidade, arquitetura multi-tenant se aplicável, deploy/rollback, checklist de início, SEO) **valem integralmente para este projeto, sem exceção**.

**Notas específicas deste projeto:**
- Site institucional público (não é SaaS interno da agência) → seção 6 (multi-tenant) não se aplica.
- Projeto tem página pública voltada ao cliente final → checklist de SEO (seção 9) é obrigatório, não opcional.
- Bot de IA vai agendar e orçar, mas **sempre finaliza direcionando pro atendente humano no WhatsApp** — nunca fecha um orçamento nem confirma agendamento sozinho sem handoff humano.

---

## 8. Checklist de início de projeto (status atual)

- [x] Repositório Git criado
- [x] Este arquivo copiado pra raiz, seção 0 preenchida
- [ ] `.env` configurado (`.gitignore` cobrindo `.env*` desde o primeiro commit)
- [ ] Sentry plugado (front e back)
- [ ] Lint (Biome) configurado
- [ ] RLS — não aplicável se não houver banco multi-tenant; se usar Firestore pro bot, aplicar regras equivalentes
- [ ] Estrutura de testes inicial
- [x] Definido: projeto único de cliente (não SaaS da agência)
- [ ] Autenticação de rota administrativa (se houver painel) separada da pública
- [ ] Definido: quem tem acesso a produção e onde ficam as chaves

---

*Este arquivo é vivo — atualize conforme o VIBE CODING PROCESS evoluir.*
