---
name: Google image scraping
description: Limitação observada ao tentar buscar imagens do Google sem API autorizada.
---

O Google pode responder com uma página de tráfego incomum e reCAPTCHA para requisições automatizadas do ambiente, mesmo com User-Agent de navegador. Scraping não é um fallback confiável para um comando de produção.

**Why:** A resposta real do Google não continha resultados e exigia resolução interativa de CAPTCHA; tentar contornar isso seria frágil e inadequado para um bot hospedado.

**How to apply:** Para pesquisa de imagens em produção, usar uma API autorizada com quota/billing ou uma integração de busca aprovada. Não prometer uma solução ilimitada baseada em HTML raspado.