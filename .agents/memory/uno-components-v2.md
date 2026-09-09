---
name: UNO Components V2
description: Regras de confiabilidade para o fluxo interativo do UNO com mesa pública, mão privada e arte gerada.
---

As interações de componentes do UNO devem ser reconhecidas imediatamente antes de gerar cartas ou editar a mesa pública; uma atualização privada nunca deve tentar virar uma mensagem pública.

**Why:** A geração da arte e a edição da mensagem podem consumir o prazo de resposta do Discord. Além disso, respostas privadas só podem continuar privadas, enquanto o estado da mesa e a vitória precisam ser visíveis no canal.

**How to apply:** Use `deferUpdate`/`update` antes do trabalho assíncrono, edite a mensagem pública separadamente e mantenha a resposta privada da mão/escolha de cor com `IsComponentsV2 | Ephemeral`.