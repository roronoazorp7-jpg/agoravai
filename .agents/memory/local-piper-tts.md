---
name: Piper TTS local
description: Decisão de síntese local em português do Brasil para evitar cotas de APIs de voz no bot.
---

O bot prioriza a voz neural feminina `pt-BR-ThalitaNeural` via Edge TTS e mantém o Piper feminino `dii_pt-BR` como fallback local.

**Why:** A voz neural soa mais natural e conversacional que o modelo Piper local. O fallback mantém a resposta disponível quando o serviço neural estiver indisponível. A voz Dii do fallback tem licença CC BY-NC-ND, portanto o uso deve permanecer não comercial e com atribuição à TigreGotico Lda.

**Como aplicar:** Manter o runtime Python com `edge-tts` e Piper fora do repositório (`.venv/` e `data/`); mudanças de voz, ritmo ou tom devem ser configuráveis por `EDGE_TTS_VOICE`, `EDGE_TTS_RATE` e `EDGE_TTS_PITCH`. Se o bot passar a ter uso comercial, trocar o fallback Dii ou obter autorização do detentor.
