---
name: Dashboard e schema
description: Regra para manter endpoints do dashboard e o schema Drizzle/Postgres em sincronia.
---

O typecheck do API server não garante que o banco de desenvolvimento já tenha colunas adicionadas ao schema; qualquer endpoint que selecione essas colunas pode retornar 500 até a sincronização do banco ser concluída.

**Why:** A tabela de configuração pode estar em uma versão anterior ao código, e o erro só aparece em runtime quando o Drizzle monta o SELECT.

**How to apply:** Ao adicionar campos usados por rotas do dashboard, confirme a existência deles no banco de desenvolvimento antes da validação no navegador e prefira alterações aditivas que preservem os registros atuais.