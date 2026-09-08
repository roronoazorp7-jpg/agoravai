---
name: Parcerias em Components V2
description: Regras de comportamento do painel de parceria publicado pelo bot.
---

As publicações de parceria devem usar Components V2 sem `accent_color` quando a cor lateral não foi configurada. O conteúdo textual público deve ser somente `partnerMessage` personalizado; não publicar o bloco automático de Promoter, Rank, total, servidor parceiro, título, thumbnail, divisória, descrição, rodapé ou frase fixa. Variáveis de parceria precisam ser resolvidas antes do envio, e `${null}`/`${default}` são valores de controle, nunca texto visível. Os dois botões têm texto e emoji independentes: `null` mantém o padrão, enquanto texto vazio com emoji válido cria um botão somente com emoji.

**Why:** O formato desejado é uma publicação limpa, com apenas o texto personalizado; configurações antigas também podiam carregar valores de controle literalmente.

**How to apply:** Ao alterar o painel de parcerias, preserve a distinção entre campo não configurado e texto publicado, mantenha o payload em Components V2 e trate valores de controle durante o render, inclusive para configurações já salvas.