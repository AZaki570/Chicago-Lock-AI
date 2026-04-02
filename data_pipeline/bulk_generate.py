import os
import time
import random
import urllib.request
import replicate

try:
    import httpx
except Exception:
    httpx = None


BASE_DIR = os.path.expanduser("~/lock_ai")
IN_DIR = os.path.join(BASE_DIR, "bases")
OUT_DIR = os.path.join(BASE_DIR, "out_v90_day_earlylate_highyield_50")

os.makedirs(OUT_DIR, exist_ok=True)

MODEL = "google/nano-banana-pro"

BASE_IMAGES = [
    os.path.join(IN_DIR, "v80_base_07_mix_commercial_small_north.png"),
    os.path.join(IN_DIR, "v80_base_03_small3_north.png"),
    os.path.join(IN_DIR, "v80_base_10_mix_all_three_north.png"),
    os.path.join(IN_DIR, "ChatGPT Image Mar 13, 2026, 10_36_48 PM.png"),
]

for base_image in BASE_IMAGES:
    if not os.path.exists(base_image):
        raise SystemExit(f"Missing base image: {base_image}")


PROMPT_HEADER = """
You are performing a STRICT constrained edit to a single aerial DAY image of the Chicago Harbor Lock.

HIGHEST PRIORITY - ORIENTATION:
- Every boat inside the chamber must face NORTH toward the partially open lake gate.
- The bow, pointed front, and forward tip of every chamber boat must point NORTH.
- The stern, rear, and back end of every chamber boat must point SOUTH.
- Zero chamber boats may have their bow facing SOUTH.
- Zero mixed directions are allowed.
- Zero opposing directions are allowed.
- Any south-facing chamber boat is invalid.
- All boats should look like a clean north-facing queue moving toward the lake gate.

SECOND PRIORITY - REPLACE THE BOATS:
- Replace all boats from the reference image with new boats.
- Do not preserve the original boat identities, silhouettes, hull shapes, colors, deck layouts, cabin structures, or superstructures.
- The boats in the reference image are placeholders only and must be replaced.

THIRD PRIORITY - LOCK STATE:
- Lake gate = PARTIAL OPEN
- River gate = CLOSED

FOURTH PRIORITY - CHAMBER GEOMETRY:
The chamber must remain three strict zones:
1) left wall lane
2) empty center navigation corridor
3) right wall lane

STRICT PLACEMENT RULES:
- Boats must stay inside the chamber only.
- Boats must be hard-locked near the left wall lane or right wall lane only.
- The center corridor must remain completely empty.
- No boats outside the chamber.
- No boats docked on the outer left side.
- No boats in open water outside the lock.
- Keep clear buffer zones near both gates.
- Favor practical spacing and readable queue structure.

STRUCTURE RULES:
- Preserve the exact lock geometry, gate geometry, walls, docks, shoreline, buildings, water boundaries, and camera perspective.
- Do not change the background composition.
- Do not move or regenerate the gates.
- Do not zoom, crop, rotate, mirror, or shift the camera.

TIME OF DAY RULE:
- Keep the image in daytime only.
- Strongly prefer EARLY MORNING light or LATE AFTERNOON / SUNSET-EDGE light.
- Early morning should feel softer, slightly cooler, lower-angle sunlight.
- Late afternoon should feel warmer, softer, and closer to sunset while still clearly daytime.
- Do not make it night.
- Do not add heavy fog, heavy rain, or dark storm weather.

FINAL PRIORITY ORDER:
1. all chamber boat bows face north
2. replace the boats
3. empty center corridor
4. boats inside chamber only
5. exact lock geometry and camera
6. early morning / late-day lighting
7. moderate boat count increase while preserving clarity
"""

FLEET_VARIANTS = [
    """
Generate a commercial-only fleet.
Use 2, 3, or 4 boats in the chamber.
Prefer 3 boats most often.
Use tugboats, workboats, compact utility boats, and small sightseeing vessels.
Favor clean, readable spacing.
""",
    """
Generate a small-boats-only fleet.
Use 2, 3, or 4 boats in the chamber.
Prefer 3 boats most often.
Use runabouts, bowriders, compact leisure boats, and small sightseeing boats.
Favor clean, readable spacing.
""",
    """
Generate a medium-boats-only fleet.
Use 2, 3, or 4 boats in the chamber.
Prefer 3 boats most often.
Use cabin cruisers, charter boats, patrol-style boats, and medium sightseeing boats.
Favor clean, readable spacing.
""",
    """
Generate a mixed fleet of small and medium boats only.
Use 2, 3, or 4 boats in the chamber.
Prefer 3 boats most often.
No large heavy commercial tugboats in this variant.
Favor clean, readable spacing.
""",
    """
Generate a mixed fleet of commercial and small boats.
Use 2, 3, or 4 boats in the chamber.
Prefer 3 boats most often.
Favor one stronger commercial anchor boat plus smaller support boats.
""",
    """
Generate a fleet biased toward sightseeing and tour-style boats.
Use 2, 3, or 4 boats in the chamber.
Prefer 3 boats most often.
Mix sightseeing vessels with small or medium support boats.
Favor visually clean queue structure.
""",
]

COUNT_VARIANTS = [
    "Use exactly 2 boats in the chamber.",
    "Use exactly 3 boats in the chamber.",
    "Use exactly 4 boats in the chamber.",
]

COUNT_WEIGHTS = [22, 50, 28]

TIME_VARIANTS = [
    "Lighting should look like early morning around 7:30 to 9:00 AM with softer lower-angle sunlight.",
    "Lighting should look like early morning around 8:00 to 9:30 AM with clean crisp air and soft light.",
    "Lighting should look like late afternoon around 4:00 to 5:00 PM with warmer light.",
    "Lighting should look like late afternoon around 4:30 to 5:30 PM with softer warmer sunlight.",
    "Lighting should look like sunset-edge daytime around 5:00 to 5:45 PM with warm low-angle light but still clearly daytime.",
]

ATMOSPHERE_VARIANTS = [
    "Add mild wind ripples on the water and a clean calm harbor feel.",
    "Add slight atmospheric softness without obscuring the lock.",
    "Add gentle breeze and lightly textured water surface.",
    "Add soft warm late-day atmosphere while preserving clear geometry.",
]

COLOR_VARIANTS = [
    "Use varied hull colors such as white, blue, red, navy, gray, tan, and mixed trim accents.",
    "Use color diversity but keep the fleet visually coherent.",
]

NEGATIVE_RULES = """
Do NOT generate:
- south-facing bows
- mixed directions
- opposing directions
- boats in the center corridor
- boats outside the chamber
- boats docked on the outer left side
- copied reference boats
- giant ships that overcrowd the chamber
- cluttered or chaotic spacing
- night
- heavy fog
- heavy rain
- dark storm weather
"""

IMAGES_TO_GENERATE = 50
RETRY_LIMIT = 50
DOWNLOAD_RETRY_LIMIT = 8


def weighted_count_instruction():
    return random.choices(COUNT_VARIANTS, weights=COUNT_WEIGHTS, k=1)[0]


def build_prompt():
    fleet = random.choice(FLEET_VARIANTS)
    count_instruction = weighted_count_instruction()
    time_instruction = random.choice(TIME_VARIANTS)
    atmosphere_instruction = random.choice(ATMOSPHERE_VARIANTS)
    color_instruction = random.choice(COLOR_VARIANTS)

    return (
        f"{PROMPT_HEADER}\n\n"
        f"FLEET TYPE:\n{fleet}\n\n"
        f"COUNT RULE:\n{count_instruction}\n\n"
        f"TIME RULE:\n{time_instruction}\n\n"
        f"ATMOSPHERE RULE:\n{atmosphere_instruction}\n\n"
        f"COLOR RULE:\n{color_instruction}\n\n"
        f"NEGATIVE RULES:\n{NEGATIVE_RULES}"
    )


def normalize_replicate_output(output):
    if isinstance(output, list):
        out = output[0]
    else:
        out = output

    if hasattr(out, "url"):
        attr = out.url
        if callable(attr):
            return attr()
        return attr

    if isinstance(out, str):
        return out

    return str(out)


def replicate_run_with_retry(prompt, base_path):
    last_err = None

    for attempt in range(1, RETRY_LIMIT + 1):
        try:
            with open(base_path, "rb") as f:
                output = replicate.run(
                    MODEL,
                    input={
                        "prompt": prompt,
                        "image_input": [f],
                        "output_format": "png",
                    },
                )
            return normalize_replicate_output(output)

        except Exception as e:
            last_err = e
            sleep_time = random.uniform(8, 20)
            print(f"generation retry {attempt}/{RETRY_LIMIT} sleeping {sleep_time:.1f}s")
            time.sleep(sleep_time)

    raise RuntimeError(last_err)


def download_image_with_retry(url, out_path):
    last_err = None

    for attempt in range(1, DOWNLOAD_RETRY_LIMIT + 1):
        tmp_path = out_path + ".part"
        try:
            if os.path.exists(tmp_path):
                os.remove(tmp_path)

            if httpx is not None:
                with httpx.stream("GET", url, timeout=180.0) as r:
                    r.raise_for_status()
                    with open(tmp_path, "wb") as f:
                        for chunk in r.iter_bytes():
                            f.write(chunk)
            else:
                urllib.request.urlretrieve(url, tmp_path)

            os.replace(tmp_path, out_path)
            return

        except Exception as e:
            last_err = e
            if os.path.exists(tmp_path):
                try:
                    os.remove(tmp_path)
                except Exception:
                    pass
            sleep_time = random.uniform(3, 10)
            print(f"download retry {attempt}/{DOWNLOAD_RETRY_LIMIT} sleeping {sleep_time:.1f}s")
            time.sleep(sleep_time)

    raise RuntimeError(f"download failed after retries: {last_err}")


def main():
    print("Starting generation")
    print("Output folder:", OUT_DIR)

    for i in range(1, IMAGES_TO_GENERATE + 1):
        prompt = build_prompt()
        base_path = random.choice(BASE_IMAGES)

        filename = f"v90_day_{i:03d}.png"
        out_path = os.path.join(OUT_DIR, filename)

        print(f"Generating {i}/{IMAGES_TO_GENERATE}")
        print("Base:", os.path.basename(base_path))

        url = replicate_run_with_retry(prompt, base_path)
        download_image_with_retry(url, out_path)

        print("Saved:", out_path)
        time.sleep(random.uniform(2, 5))

    print("Done")


if __name__ == "__main__":
    main()
