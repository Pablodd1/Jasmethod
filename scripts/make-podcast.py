#!/usr/bin/env python3
# Generate a 2-voice podcast MP3 from the embedded script using edge-tts + ffmpeg.
# Run: python3 scripts/make-podcast.py [output.mp3]
import asyncio, csv, subprocess, sys, os, tempfile
import edge_tts

VOICES = {"H": "en-US-AvaNeural", "P": "en-GB-RyanNeural"}  # host, podcast-coach voice
OUT = sys.argv[1] if len(sys.argv) > 1 else os.path.expanduser("~/JasMiamiMethod/docs/jasmiamimethod-podcast.mp3")
SRC = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "docs", "podcast-script.csv")

async def synth(text, voice, path):
    await edge_tts.Communicate(text, voice, rate="+6%").save(path)

async def main():
    rows = list(csv.reader(open(SRC, encoding="utf-8")))
    parts = []
    with tempfile.TemporaryDirectory() as td:
        for i, (role, *rest) in enumerate(r for r in rows if r and r[0] in VOICES):
            text = ", ".join(rest) if len(rest) > 1 else rest[0]
            p = os.path.join(td, f"{i:03d}.mp3")
            await synth(text, VOICES[role], p)
            parts.append(p)
        # 0.35s silence between lines
        sil = os.path.join(td, "sil.mp3")
        subprocess.run(["ffmpeg", "-y", "-f", "lavfi", "-i", "anullsrc=r=24000:cl=mono", "-t", "0.35", "-q:a", "9", sil], check=True, capture_output=True)
        with open(os.path.join(td, "list.txt"), "w") as f:
            for p in parts:
                f.write(f"file '{p}'\nfile '{sil}'\n")
        subprocess.run(["ffmpeg", "-y", "-f", "concat", "-safe", "0", "-i", os.path.join(td, "list.txt"), "-c:a", "libmp3lame", "-q:a", "4", OUT], check=True, capture_output=True)
    print(f"{OUT}  lines={len(parts)}")

asyncio.run(main())
