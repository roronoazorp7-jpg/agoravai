import json
import os
import sys
from pathlib import Path

from TTS.api import TTS


MODEL_NAME = os.getenv(
    "XTTS_MODEL",
    "tts_models/multilingual/multi-dataset/xtts_v2",
).strip()
SPEAKER_WAV = Path(
    os.getenv("XTTS_SPEAKER_WAV", "data/tts/xtts-speaker.wav").strip()
).expanduser()
LANGUAGE = os.getenv("XTTS_LANGUAGE", "pt").strip() or "pt"
USE_GPU = os.getenv("XTTS_USE_GPU", "false").strip().lower() in {
    "1",
    "true",
    "yes",
    "on",
}


def emit(payload):
    sys.stdout.write(json.dumps(payload, ensure_ascii=False) + "\n")
    sys.stdout.flush()


if not SPEAKER_WAV.is_file():
    raise FileNotFoundError(
        f"XTTS_SPEAKER_WAV não encontrado: {SPEAKER_WAV}. "
        "Envie uma amostra de voz limpa de 6 a 15 segundos."
    )


print(f"[XTTS] carregando {MODEL_NAME} (gpu={USE_GPU})", file=sys.stderr, flush=True)
tts = TTS(model_name=MODEL_NAME, progress_bar=False, gpu=USE_GPU)
print("[XTTS] modelo carregado", file=sys.stderr, flush=True)


for line in sys.stdin:
    line = line.strip()
    if not line:
        continue

    request = None
    try:
        request = json.loads(line)
        output_path = Path(request["outputPath"]).expanduser()
        text = str(request["text"]).strip()
        if not text:
            raise ValueError("Texto vazio para síntese")

        output_path.parent.mkdir(parents=True, exist_ok=True)
        tts.tts_to_file(
            text=text,
            speaker_wav=str(SPEAKER_WAV),
            language=LANGUAGE,
            file_path=str(output_path),
        )
        emit(
            {
                "id": request.get("id"),
                "ok": True,
                "outputPath": str(output_path),
            }
        )
    except Exception as error:
        emit(
            {
                "id": request.get("id") if request else None,
                "ok": False,
                "error": str(error),
            }
        )