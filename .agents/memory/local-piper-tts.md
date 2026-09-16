---
name: TTS local do bot
description: Estratégia de síntese local em português do Brasil sem cota de API.
---

O bot usa XTTS-v2 local como voz principal, com uma amostra de voz autorizada configurada em `XTTS_SPEAKER_WAV`; o Piper permanece como fallback local.

**Why:** XTTS-v2 entrega uma fala mais fluida, humanizada e descontraída que Piper sem depender de cota externa. A amostra de referência precisa ter autorização de uso; o fallback mantém respostas disponíveis quando o modelo pesado falhar.

**Como aplicar:** O worker Python carrega o XTTS-v2 uma vez e atende uma fila local. Configure `XTTS_SPEAKER_WAV`, `XTTS_LANGUAGE` e `XTTS_USE_GPU`; mantenha modelos e áudios fora do Git (`data/`).
