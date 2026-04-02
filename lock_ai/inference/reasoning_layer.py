# Chicago Lock AI Project — Reasoning Layer
# Translates 3 model outputs into a predicted lock state

# Gate positions (from gate classifier model)
OPEN = "open"
CLOSED = "closed"
PARTIAL = "partial"

# Boat orientations (from orientation model)
TOWARD_RIVER = "toward_river"
TOWARD_LAKE = "toward_lake"

# Confidence flags
HIGH = "high"
LOW = "low"

# Tunable thresholds — adjust these without touching the logic
MAJORITY_THRESHOLD = 0.60      # 60% of boats must agree on orientation
LOW_CONFIDENCE_FLOOR = 60      # below 60% confidence score = low confidence tag in UI

# Lock state outputs
class LockState:
    LOCK_CLOSED = "Lock Closed"
    OPEN_LAKE_TO_RIVER = "Open Lake to River"
    OPEN_LAKE_TO_RIVER_ENTERING = "Open Lake to River — Vessels Entering"
    LOCK_SEALED_TOWARD_RIVER = "Lock Sealed — About to Lock Toward River"
    LOCKING_TOWARD_RIVER = "Locking Toward River"
    VESSELS_EXITING_TOWARD_RIVER = "Vessels Exiting Toward River"
    OPEN_RIVER_TO_LAKE = "Open River to Lake"
    OPEN_RIVER_TO_LAKE_ENTERING = "Open River to Lake — Vessels Entering"
    LOCK_SEALED_TOWARD_LAKE = "Lock Sealed — About to Lock Toward Lake"
    LOCKING_TOWARD_LAKE = "Locking Toward Lake"
    VESSELS_EXITING_TOWARD_LAKE = "Vessels Exiting Toward Lake"
    ERROR = "Error — No Output"


def majority_orientation(orientation, boat_count, target_orientation):
    """Returns (meets_threshold, confidence_score)"""
    if boat_count == 0 or orientation is None:
        return False, 0
    if orientation == target_orientation:
        return True, 100
    return False, 0


def classify_lock_state(
    lake_gate,
    river_gate,
    chamber_boats,
    chamber_orientation,
    infront_lake_boats,
    infront_lake_orientation,
    infront_river_boats,
    infront_river_orientation,
    lake_waiting_boats,
    river_waiting_boats,
):
    # --- GLOBAL GUARDS ---
    if lake_gate == OPEN and river_gate == OPEN:
        return {"state": LockState.ERROR, "confidence": 0, "confidence_flag": LOW, "reason": "Both gates open — impossible"}

    if lake_gate == PARTIAL and river_gate == PARTIAL:
        return {"state": LockState.ERROR, "confidence": 0, "confidence_flag": LOW, "reason": "Both gates partial — impossible"}

    # --- STATE 0: LOCK CLOSED ---
    if lake_gate == CLOSED and river_gate == CLOSED and chamber_boats == 0:
        return {
            "state": LockState.LOCK_CLOSED,
            "confidence": 100,
            "confidence_flag": HIGH,
            "reason": "Both gates closed, chamber empty"
        }

    # --- STATE 1a / 1b / 8: lake gate open, river gate closed ---
    if lake_gate == OPEN and river_gate == CLOSED:
        if infront_lake_boats == 0 and chamber_boats == 0:
            return {
                "state": LockState.OPEN_LAKE_TO_RIVER,
                "confidence": 100,
                "confidence_flag": HIGH,
                "reason": "Lake gate open, no boats in infront zone or chamber"
            }
        if infront_lake_boats >= 1 or chamber_boats >= 1:
            # Use infront_lake zone if boats present, fallback to chamber
            primary_orientation = infront_lake_orientation if infront_lake_boats >= 1 else chamber_orientation
            primary_count = infront_lake_boats if infront_lake_boats >= 1 else chamber_boats

            meets_lake, score_lake = majority_orientation(primary_orientation, primary_count, TOWARD_LAKE)
            meets_river, score_river = majority_orientation(primary_orientation, primary_count, TOWARD_RIVER)

            if meets_lake:
                confidence_flag = HIGH if score_lake >= LOW_CONFIDENCE_FLOOR else LOW
                return {
                    "state": LockState.VESSELS_EXITING_TOWARD_LAKE,
                    "confidence": score_lake,
                    "confidence_flag": confidence_flag,
                    "reason": "Lake gate open, vessels exiting toward lake"
                }
            if meets_river:
                confidence_flag = HIGH if score_river >= LOW_CONFIDENCE_FLOOR else LOW
                return {
                    "state": LockState.OPEN_LAKE_TO_RIVER_ENTERING,
                    "confidence": score_river,
                    "confidence_flag": confidence_flag,
                    "reason": "Boats in infront lake zone or chamber heading toward river"
                }

    # --- STATE 2 or 6: LOCK SEALED — direction determined by orientation ---
    if lake_gate == CLOSED and river_gate == CLOSED and chamber_boats >= 1:
        meets_river, score_river = majority_orientation(chamber_orientation, chamber_boats, TOWARD_RIVER)
        meets_lake, score_lake = majority_orientation(chamber_orientation, chamber_boats, TOWARD_LAKE)
        if meets_river:
            confidence_flag = HIGH if score_river >= LOW_CONFIDENCE_FLOOR else LOW
            return {
                "state": LockState.LOCK_SEALED_TOWARD_RIVER,
                "confidence": score_river,
                "confidence_flag": confidence_flag,
                "reason": "Both gates closed, boats in chamber heading toward river"
            }
        if meets_lake:
            confidence_flag = HIGH if score_lake >= LOW_CONFIDENCE_FLOOR else LOW
            return {
                "state": LockState.LOCK_SEALED_TOWARD_LAKE,
                "confidence": score_lake,
                "confidence_flag": confidence_flag,
                "reason": "Both gates closed, boats in chamber heading toward lake"
            }
        return {"state": LockState.ERROR, "confidence": 0, "confidence_flag": LOW, "reason": "Both gates closed, orientation unclear"}

    # --- STATE 3: LOCKING TOWARD RIVER ---
    if lake_gate == CLOSED and river_gate == PARTIAL:
        meets, score = majority_orientation(chamber_orientation, chamber_boats, TOWARD_RIVER)
        if chamber_boats >= 1 and not meets:
            return {"state": LockState.ERROR, "confidence": 0, "confidence_flag": LOW, "reason": "Gate partial but boats facing wrong direction"}
        confidence = 100 if chamber_boats == 0 else score
        confidence_flag = HIGH if chamber_boats == 0 else (HIGH if score >= LOW_CONFIDENCE_FLOOR else LOW)
        return {
            "state": LockState.LOCKING_TOWARD_RIVER,
            "confidence": confidence,
            "confidence_flag": confidence_flag,
            "reason": "River gate partial, locking toward river"
        }

    # --- STATE 4 or 5a/5b: river gate open, lake gate closed ---
    if lake_gate == CLOSED and river_gate == OPEN:
        # Transition to 5a — both zones empty
        if chamber_boats == 0 and infront_river_boats == 0:
            return {
                "state": LockState.OPEN_RIVER_TO_LAKE,
                "confidence": 100,
                "confidence_flag": HIGH,
                "reason": "Both zones empty — transition to State 5a"
            }
        if infront_river_boats >= 1 or chamber_boats >= 1:
            # Use infront_river zone if boats present, fallback to chamber
            primary_orientation = infront_river_orientation if infront_river_boats >= 1 else chamber_orientation
            primary_count = infront_river_boats if infront_river_boats >= 1 else chamber_boats

            meets_lake, score_lake = majority_orientation(primary_orientation, primary_count, TOWARD_LAKE)
            meets_river, score_river = majority_orientation(primary_orientation, primary_count, TOWARD_RIVER)

            if meets_lake:
                confidence_flag = HIGH if score_lake >= LOW_CONFIDENCE_FLOOR else LOW
                return {
                    "state": LockState.OPEN_RIVER_TO_LAKE_ENTERING,
                    "confidence": score_lake,
                    "confidence_flag": confidence_flag,
                    "reason": "Boats heading toward lake — entering from river"
                }
            if meets_river:
                confidence_flag = HIGH if score_river >= LOW_CONFIDENCE_FLOOR else LOW
                return {
                    "state": LockState.VESSELS_EXITING_TOWARD_RIVER,
                    "confidence": score_river,
                    "confidence_flag": confidence_flag,
                    "reason": "River gate open, vessels exiting toward river"
                }

    # --- STATE 7: LOCKING TOWARD LAKE ---
    if river_gate == CLOSED and lake_gate == PARTIAL:
        meets, score = majority_orientation(chamber_orientation, chamber_boats, TOWARD_LAKE)
        if chamber_boats >= 1 and not meets:
            return {"state": LockState.ERROR, "confidence": 0, "confidence_flag": LOW, "reason": "Gate partial but boats facing wrong direction"}
        confidence = 100 if chamber_boats == 0 else score
        confidence_flag = HIGH if chamber_boats == 0 else (HIGH if score >= LOW_CONFIDENCE_FLOOR else LOW)
        return {
            "state": LockState.LOCKING_TOWARD_LAKE,
            "confidence": confidence,
            "confidence_flag": confidence_flag,
            "reason": "Lake gate partial, locking toward lake"
        }

    # --- CATCH ALL: NO STATE MATCHED ---
    return {
        "state": LockState.ERROR,
        "confidence": 0,
        "confidence_flag": LOW,
        "reason": "No state matched inputs"
    }


if __name__ == "__main__":
    result = classify_lock_state(
        lake_gate=CLOSED,
        river_gate=CLOSED,
        chamber_boats=0,
        chamber_orientation=None,
        infront_lake_boats=0,
        infront_lake_orientation=None,
        infront_river_boats=0,
        infront_river_orientation=None,
        lake_waiting_boats=0,
        river_waiting_boats=0,
    )
    print(result)
