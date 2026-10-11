"""Shared supported-game registry (games.json is the source of truth)."""
import json
from pathlib import Path

GAMES = json.loads(Path(__file__).with_name("games.json").read_text(encoding="utf-8"))
DEFAULT_GAME_ID = 19567


def get_game(value=DEFAULT_GAME_ID):
    for game in GAMES:
        if value in (game["id"], game["key"]):
            return dict(game)
    raise ValueError(f"Unsupported game: {value}")


def state_game(state):
    # Checkpoints and reports made before multi-game support are ZZZ only.
    return get_game(state.get("game_id", DEFAULT_GAME_ID))
