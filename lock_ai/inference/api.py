"""
Chicago Lock AI — FastAPI Backend
Wraps run_inference.py and serves results to the React frontend
"""

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pathlib import Path
import sys
import os

sys.path.append(os.path.dirname(__file__))
from run_inference import run_inference, BASE

app = FastAPI(title="Chicago Lock AI", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

CAROUSEL_DIR = BASE / "DEMO CAROSEL IMAGE SET"

VALID_SLOTS = {
    1, 2, 3, 4, 5, 6, 7, 8,
    9, 10, 12, 13, 14,
    16, 17, 18, 19, 20, 21,
    22, 23, 24, 26, 27, 28,
    29, 30, 31, 33, 34,
}

SLOT_WEATHER = {
    1: "Sunny", 2: "Sunny", 3: "Sunny", 4: "Sunny",
    5: "Sunny", 6: "Sunny", 7: "Sunny", 8: "Sunny",
    9: "Hazy", 10: "Hazy", 12: "Hazy", 13: "Hazy", 14: "Hazy",
    16: "Cloudy", 17: "Cloudy", 18: "Cloudy", 19: "Cloudy", 20: "Cloudy", 21: "Cloudy",
    22: "Golden Hour", 23: "Golden Hour", 24: "Golden Hour",
    26: "Golden Hour", 27: "Golden Hour", 28: "Golden Hour",
    29: "Rain", 30: "Rain", 31: "Rain", 33: "Rain", 34: "Rain",
}

app.mount("/images-static", StaticFiles(directory=str(CAROUSEL_DIR)), name="images")

def adjust_confidence(raw_confidence: int, override_count: int) -> int:
    if override_count == 0:
        return raw_confidence
    elif override_count == 1:
        return min(raw_confidence, 85)
    elif override_count == 2:
        return min(raw_confidence, 75)
    else:
        return min(raw_confidence, 65)

def parse_time(parts):
    for part in parts:
        suffix = None
        if part.upper().endswith("PM"):
            suffix = "PM"
            t = part[:-2]
        elif part.upper().endswith("AM"):
            suffix = "AM"
            t = part[:-2]
        else:
            continue
        t = ''.join(c for c in t if c.isdigit())
        if len(t) == 3:
            t = f"0{t}"
        if len(t) == 4:
            return f"{t[:2]}:{t[2:4]} {suffix}"
    for part in parts:
        if part.isdigit() and len(part) == 4:
            return f"{part[:2]}:{part[2:4]} PM"
    return None

@app.get("/images")
def list_images():
    if not CAROUSEL_DIR.exists():
        raise HTTPException(status_code=404, detail="Carousel directory not found")

    images = []
    for f in sorted(CAROUSEL_DIR.glob("slot_*.png")):
        parts = f.stem.split("_")
        if len(parts) < 2 or not parts[1].isdigit():
            continue
        slot_num = int(parts[1])
        if slot_num not in VALID_SLOTS:
            continue

        time_str = parse_time(parts)
        weather = SLOT_WEATHER.get(slot_num, "Unknown")

        images.append({
            "filename": f.name,
            "slot": slot_num,
            "time": time_str or f"Slot {slot_num}",
            "weather": weather,
            "thumbnail_url": f"https://plashiest-mercy-nonspaciously.ngrok-free.dev/images-static/{f.name}",
            "image_url": f"https://plashiest-mercy-nonspaciously.ngrok-free.dev/images-static/{f.name}",
        })

    return {"images": images}


@app.get("/infer/{filename}")
def infer(filename: str):
    image_path = CAROUSEL_DIR / filename
    if not image_path.exists():
        raise HTTPException(status_code=404, detail=f"Image not found: {filename}")

    try:
        result = run_inference(str(image_path))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Inference failed: {str(e)}")

    adjusted_conf = adjust_confidence(result["confidence"], result["override_count"])

    r = result.get("toward_river_count", 0)
    l = result.get("toward_lake_count", 0)
    infront_lake = result["zone_counts"].get("infront_lake_gate", 0)
    infront_river = result["zone_counts"].get("infront_river_gate", 0)

    if r + l == 0:
        direction = None
    elif r > l:
        direction = "toward_river"
    else:
        direction = "toward_lake"

    return {
        "state":               result["state"],
        "confidence":          adjusted_conf,
        "raw_confidence":      result["confidence"],
        "confidence_flag":     "high" if adjusted_conf >= 80 else "low",
        "reason":              result["reason"],
        "override_count":      result["override_count"],
        "overrides_fired":     result["overrides_fired"],
        "is_clean":            result["override_count"] == 0,
        "lake_gate":           result["final_lake_gate"],
        "river_gate":          result["final_river_gate"],
        "raw_lake_gate":       result["raw_lake_gate"],
        "raw_river_gate":      result["raw_river_gate"],
        "lake_conf":           result.get("lake_conf", 0),
        "river_conf":          result.get("river_conf", 0),
        "chamber_count":       result["zone_counts"].get("chamber", 0),
        "lake_side_count":     result["zone_counts"].get("lake_waiting", 0) + infront_lake,
        "river_side_count":    result["zone_counts"].get("river_waiting", 0) + infront_river,
        "chamber_failsafe":    result["chamber_failsafe"],
        "direction":           direction,
        "toward_river_count":  result.get("toward_river_count", 0),
        "toward_lake_count":   result.get("toward_lake_count", 0),
        "inference_log":       result.get("inference_log", []),
    }


@app.get("/health")
def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000, reload=False)
