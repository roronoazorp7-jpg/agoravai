---
name: Application emojis and V2 panels
description: Regras para emojis registrados em background e payloads Components V2 da loja.
---

Emojis de aplicação são registrados em background no evento `ready`; qualquer chamada de `getEmoji` antes da conclusão precisa retornar um emoji Unicode seguro, nunca um pseudo-emoji como `:nome:`.

**Why:** Menus e botões enviados ao Discord validam o nome do emoji; um nome textual sem `id` faz a API rejeitar o payload e pode parecer um erro interno no painel V2.

**How to apply:** Mantenha os emojis personalizados quando estiverem no cache, mas defina fallbacks Unicode para todos os nomes usados em componentes e em mensagens enquanto o registro ainda está pendente.

Mensagens tradicionais com embeds não devem reutilizar `customId`s de painéis Components V2; fluxos V1 e V2 precisam de identificadores e handlers separados.

**Why:** Atualizar uma mensagem V1 usando um payload V2 pode ser rejeitado pela API do Discord e aparecer apenas como “Ocorreu um erro interno” para o usuário.

**How to apply:** Ao manter um comando slash legado em embeds, use prefixos próprios para seleção, confirmação e cancelamento, mesmo que a ação equivalente exista no painel V2.

Painéis V2 interativos devem manter o `ContainerBuilder` para o texto e enviar as `ActionRow`s como componentes de topo, não aninhadas no container.

**Why:** Neste runtime, o Discord pode rejeitar o payload com linhas de botões aninhadas mesmo que o builder aceite a estrutura.

**How to apply:** Use o container para conteúdo visual e componha o payload como `[container, ...buttonRows]`, mantendo no máximo os limites de componentes da API.