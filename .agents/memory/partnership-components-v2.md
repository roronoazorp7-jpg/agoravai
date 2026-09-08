---
name: Parcerias em Components V2
description: Regras de comportamento do painel de parceria publicado pelo bot.
---

As publicações de parceria devem usar Components V2 sem `accent_color` quando a cor lateral não foi configurada. Mensagem e descrição opcionais vazias não devem gerar um bloco de texto nem substituir o conteúdo por uma mensagem padrão. Variáveis de parceria precisam ser resolvidas antes do envio, e `${null}`/`${default}` são valores de controle, nunca texto visível.

**Why:** O fluxo anterior publicava uma mensagem de agradecimento mesmo quando o administrador limpava o campo e mantinha a barra lateral do embed; configurações antigas também podiam carregar os valores de controle literalmente.

**How to apply:** Ao alterar o painel de parcerias, preserve a distinção entre campo não configurado e texto publicado, mantenha o payload em Components V2 e trate valores de controle durante o render, inclusive para configurações já salvas.