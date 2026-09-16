---
name: TTS local do bot
description: Estratégia de síntese local em português do Brasil sem cota de API.
---

O bot usa exclusivamente XTTS-v2 local, com uma amostra de voz autorizada configurada em `XTTS_SPEAKER_WAV`.

**Why:** XTTS-v2 entrega uma fala mais fluida, humanizada e descontraída sem depender de cota externa. Usar outro sintetizador como fallback faria o bot voltar silenciosamente à voz antiga.

**Como aplicar:** O worker Python carrega o XTTS-v2 uma vez e atende uma fila local. Configure `XTTS_SPEAKER_WAV`, `XTTS_LANGUAGE` e `XTTS_USE_GPU`; se o XTTS falhar, o fluxo deve retornar erro para o fallback textual do bot, nunca para outra engine de voz.
