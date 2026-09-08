---
name: Mídia dos gatilhos
description: Restrição de persistência para arquivos usados pelas respostas automáticas do bot.
---

Os arquivos de resposta dos gatilhos novos ficam persistidos no PostgreSQL como bytes (`responseData`). O disco local é apenas cache reconstruível; `responseUrl` permanece para compatibilidade com registros legados.

**Why:** O bot roda fora do workspace em uma plataforma com filesystem efêmero, e links de anexos do Discord podem expirar. A mídia binária no banco sobrevive a reinícios e deploys.

**How to apply:** Ao criar um gatilho, baixe a mídia, limite-a a 100 MB e crie o registro com `responseData` preenchido; ao responder, restaure o cache local a partir do banco. Mantenha recuperação compatível para registros legados cujo link ainda esteja válido. Uploads antigos do TikTok podem não ter extensão nem MIME salvo; ao entregar um arquivo assim, inferir `.mp4` quando a origem indicar vídeo para que o Discord mostre o player.