# Chicago Lock AI

**A 3-model computer vision system for real-time lock state detection at Chicago Harbor Lock.**

🔗 **Live Demo:** [lock-ai-ui.vercel.app](https://lock-ai-ui.vercel.app)  
📸 **Dataset:** [huggingface.co/datasets/Zaki570/chicago-lock-ai](https://huggingface.co/datasets/Zaki570/chicago-lock-ai)  
📍 **Status:** Phase 1 complete — synthetic data proof of concept

---

## The Problem

Chicago Harbor Lock connects the Chicago River and Lake Michigan, handling over 80,000 vessels and 900,000 passengers each year. On busy days, up to 100 vessels pass through. Today, checking the lock's status requires going in person, leaving boat captains with no visibility into current lock cycle status or estimated wait times. The result is hours of unplanned delays with no infrastructure solution in place.

**Why synthetic data?** Installing a camera at the lock is not legally permitted without Army Corps of Engineers approval. Real-world data collection was not possible for Phase 1. The entire dataset was built synthetically from a single aerial base image of the lock, iterated into every realistic operational condition.

---

## System Overview

```
Aerial Image
     │
     ├──► Gate Classifier (YOLOv8s-cls)
     │         Lake gate: open / closed / partial
     │         River gate: open / closed / partial
     │
     ├──► Boat Detector (YOLOv8s-seg)
     │         5 spatial zones: chamber, infront_lake_gate,
     │         infront_river_gate, lake_waiting, river_waiting
     │
     ├──► Orientation Classifier (YOLOv8s-cls)
     │         Per-boat: toward_lake / toward_river / na
     │
     └──► Reasoning Layer
               Fuses all outputs + physics rules →
               Plain-language lock state + confidence score
```

**3 models. 1 reasoning layer. 1 image. 1 human-readable lock state.**

---

## Model Performance

| Model | Architecture | Metric | Score |
|---|---|---|---|
| Gate Classifier | YOLOv8s-cls | Top-1 Accuracy | **99.6%** |
| Boat Detector | YOLOv8s-seg | mAP50 | **91.0%** |
| Boat Detector | YOLOv8s-seg | Mask mAP50 | **91.4%** |
| Orientation Classifier | YOLOv8s-cls | Top-1 Accuracy | **99.0%** |

All models trained and validated on a synthetic dataset of **1,147 images** with **6,070 annotations**.  
Validation set: 20% held-out split (229 images), never seen during training.  
Monte Carlo simulation: 1,000 runs, reasoning layer passed all.

> **Note:** These results are on synthetic data, which provides favorable training conditions. Phase 2 will validate on real-world footage from a fixed camera at the lock.

---

## The Data Pipeline

### Step 1 — Base Image

The dataset begins with a single aerial photograph of Chicago Harbor Lock, sourced from publicly available satellite/aerial imagery. This one image became the seed for every training example in the dataset.

### Step 2 — Synthetic Data Engine

Because real-world image capture at the lock is not legally permitted without Army Corps of Engineers authorization, a synthetic data pipeline was built to generate every training image from the base image programmatically.

**Tools used:**
- **Flux Fill (image inpainting)** via Replicate API — primary inpainting engine for generating boats, wake, water movement, and atmospheric conditions
- **Allenwood/LaMa** via Replicate API — gate position editing; used to cleanly remove and redraw gate states (open, closed, partial) without visual artifacts
- **Google Banana Pro (`google/nano-banana-pro`)** via Replicate API — mass production engine for bulk generation across scenario and weather variants
- **Photopea** — manual edits, compositing, and fine-tuning individual images where automated generation produced artifacts

**Prompt engineering:** Over 100 versioned `bulk_generate` scripts were written iteratively (v2 through v100+), each refining prompts for scenario accuracy, boat realism, weather conditions, gate position fidelity, and visual consistency. The versioning reflects the real engineering effort of prompt iteration — not a single script, but a documented evolution.

### Step 3 — Scenario Structure

The dataset is organized into **5 operational gate-state scenarios**, each representing a distinct phase of the lock cycle:

| Scenario Folder | Lake Gate | River Gate | Images |
|---|---|---|---|
| `LAKE_CLOSED_RIVER_CLOSED` | Closed | Closed | ~100 |
| `LAKE_OPEN_RIVER_CLOSED` | Open | Closed | ~100 |
| `LAKE_CLOSED_RIVER_OPEN` | Closed | Open | ~100 |
| `LAKE_PARTIAL_RIVER_CLOSED` | Partial | Closed | ~100 |
| `LAKE_CLOSED_RIVER_PARTIAL` | Closed | Partial | ~100 |

**Total: ~500 pre-annotation images.** After augmentation and variant generation, the final training set reached **1,147 images**.

### Step 4 — Weather & Lighting Conditions

Each scenario was generated across **5 environmental conditions** to ensure the models generalize across real-world operating hours:

- **Day — clear**
- **Night**
- **Fog / haze**
- **Sparse / low-traffic variants**
- **Special conditions** (e.g. fireworks, heavy river traffic)

### Step 5 — CVAT Annotation

All 1,147 images were manually annotated in **CVAT (Computer Vision Annotation Tool)**.

**Annotation schema — 3 label classes, all polygon:**

**`lake_gate`**
- Attribute: `position` → `open` | `closed` | `partial`
- Color: Blue

**`river_gate`**
- Attribute: `position` → `open` | `closed` | `partial`
- Color: Green

**`boat`**
- Attribute: `zone` → `chamber` | `infront_lake_gate` | `infront_river_gate` | `lake_waiting` | `river_waiting`
- Attribute: `orientation` → `toward_lake` | `toward_river` | `na`
- Color: Red

**Annotation totals:**

| Split | Lake Gate | River Gate | Boats | Total Instances |
|---|---|---|---|---|
| Train | 916 | 916 | 4,238 | ~5,070 |
| Val | 229 | 229 | ~770 | ~1,000 |
| **Total** | **1,145** | **1,145** | **~5,008** | **~6,070** |

**Gate crop breakdown (train):**

| Class | Train | Val |
|---|---|---|
| lake_gate_closed | 567 | 129 |
| lake_gate_open | 171 | 45 |
| lake_gate_partial | 178 | 55 |
| river_gate_closed | 537 | 142 |
| river_gate_open | 183 | 46 |
| river_gate_partial | 196 | 41 |

### Step 6 — Validation Scripts

After every annotation batch, custom Python scripts were run to catch schema violations before training:

- `find_na_chamber.py` — finds boats in the chamber with no orientation assigned (required field)
- `find_violations.py` — catches any boat-zone-orientation combinations that violate lock physics
- `analyze_dataset.py` — full annotation distribution summary across splits
- `split_dataset.py` — reproducible 80/20 train/val split

These scripts ran on COCO-format JSON exports from CVAT and surfaced real annotation errors before any model saw the data. This was a deliberate data quality step, not an afterthought.

### Step 7 — Model Training

Three models trained sequentially on Apple M4 Pro with MPS acceleration:

**Gate Classifier**
- Architecture: YOLOv8s-cls
- Input: cropped gate regions (lake gate + river gate separately)
- Classes: 6 (lake_open, lake_closed, lake_partial, river_open, river_closed, river_partial)
- Preprocessing: `crop_gates.py` + `prepare_orientation_dataset.py`

**Boat Detector**
- Architecture: YOLOv8s-seg (instance segmentation)
- Input: full 640×640 aerial images
- Classes: 5 spatial zones
- Preprocessing: `prepare_boat_detection.py`

**Orientation Classifier**
- Architecture: YOLOv8s-cls
- Input: cropped individual boat regions
- Classes: 3 (toward_lake, toward_river, na)

### Step 8 — Demo Carousel Generation

A **30-image evaluation carousel** was generated as a held-out demo set — none of these images were used during training. The carousel covers:

- 7 weather/lighting cycles
- All major lock states and gate position combinations
- Multiple boat counts and configurations

Each carousel slot was generated via an individual `slot_XX.py` script using the same Replicate API pipeline as training data but with stricter visual quality control. The `generate_slot.py` and `batch_carousel.py` scripts managed final production.

### Step 9 — Reasoning Layer

`reasoning_layer.py` fuses the three model outputs into a single lock state using operational physics rules:

- If both gates are closed and boats are in the chamber → LOCKING
- If lake gate is open → OPEN LAKE TO RIVER (directional based on orientation)
- If river gate is open → OPEN RIVER TO LAKE
- Partial gate states map to transition phases
- Physics overrides fire when model outputs are physically impossible (e.g. both gates open simultaneously)
- Each override reduces the output confidence score (100% → 85% → 75%)
- Chamber failsafe: if boats detected in chamber but no chamber orientation → confidence penalty applied

### Step 10 — Inference API & Demo UI

**Backend:** `inference/api.py` — FastAPI wrapper around `run_inference.py`, served locally via uvicorn + exposed publicly via ngrok

**Frontend:** React + Tailwind, dark industrial aesthetic, deployed to Vercel at [lock-ai-ui.vercel.app](https://lock-ai-ui.vercel.app)

**Demo flow:** Select image from carousel → click "Run Lock State Detection" → gate states, boat counts, orientation, lock state, and confidence displayed in real time.

---

## Repository Structure

```
Chicago-Lock-AI/
├── lock_ai/
│   ├── inference/
│   │   ├── api.py                    # FastAPI backend
│   │   ├── run_inference.py          # 3-model inference pipeline
│   │   └── reasoning_layer.py        # Physics-based state fusion
│   ├── demo_carousel/                # 30 held-out evaluation images
│   └── batch_results.json            # Full carousel evaluation results
├── lock-ai-ui/                       # React frontend (Vercel)
│   └── src/App.js
└── README.md
```

**Not included in this repo (available via Hugging Face dataset):**
- Full annotated dataset (1,147 images + 6,070 annotations)
- All bulk_generate scripts (v2–v100+)
- Model weights (too large for GitHub; available on request)

---

## Lock State Classes

The reasoning layer outputs one of the following human-readable states:

| State | Lake Gate | River Gate | Boats |
|---|---|---|---|
| OPEN LAKE TO RIVER | Open | Closed | Toward river |
| LOCK SEALED → TOWARD RIVER | Closed | Closed | South-facing |
| LOCKING TOWARD RIVER | Closed | Partial | In chamber |
| VESSELS EXITING TOWARD RIVER | Closed | Open | Exiting south |
| OPEN RIVER TO LAKE | Closed | Open | Toward lake |
| LOCK SEALED → TOWARD LAKE | Closed | Closed | North-facing |
| LOCKING TOWARD LAKE | Partial | Closed | In chamber |
| VESSELS EXITING TOWARD LAKE | Open | Closed | Exiting north |
| DEFAULT / IDLE | Closed | Closed | None |

---

## Running the Demo Locally

**Requirements:** Python 3.10+, Node.js 18+

```bash
# 1. Install backend dependencies
pip install fastapi uvicorn ultralytics torch

# 2. Start the inference API
cd lock_ai/inference
python api.py
# → Running on http://localhost:8000

# 3. In a new terminal, start the frontend
cd lock-ai-ui
npm install && npm start
# → Opens on http://localhost:3000
```

---

## Phase 2

Phase 1 establishes that the architecture works on a controlled synthetic dataset. Phase 2 requires:

1. **Army Corps of Engineers approval** to install a fixed camera at Chicago Harbor Lock
2. **Real-world data collection** — continuous footage across seasons, weather, and traffic volumes
3. **Model fine-tuning** on real imagery to close the synthetic-to-real domain gap
4. **Academic or institutional backing** to support data collection, compute, and regulatory navigation
5. **Public deployment** as an open tool for the boating community — free, infrastructure-level visibility into lock state

This is intended as a **public service tool**. Chicago Harbor Lock serves tens of thousands of recreational and commercial vessels each year. Real-time lock state awareness would reduce wait times, improve route planning, and bring basic operational transparency to an infrastructure that currently has none.

---

## Technical Stack

| Layer | Tool |
|---|---|
| Model training | YOLOv8 (Ultralytics) |
| Training hardware | Apple M4 Pro, MPS acceleration |
| Synthetic data — inpainting | Flux Fill via Replicate API |
| Synthetic data — gate editing | Allenwood/LaMa via Replicate API |
| Synthetic data — bulk production | Google Banana Pro via Replicate API |
| Manual image editing | Photopea |
| Annotation | CVAT |
| Inference API | FastAPI + uvicorn |
| Public tunnel | ngrok |
| Frontend | React + Tailwind |
| Deployment | Vercel |

---

## Author

**Ahmed Zaki**  
Boat captain. Product manager. Independent AI researcher.  
Chicago, IL

Built by someone who has sat in the lock queue with no information and decided to do something about it.

---

## License

MIT — open for use, adaptation, and Phase 2 collaboration.
