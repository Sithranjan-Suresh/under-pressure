import asyncio
import json
import os
import sys
from contextlib import asynccontextmanager

import pandas as pd
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from routers import live, matches, methodology, teams
from routers.live import refresh_live_data

DATA_DIR = os.path.join(os.path.dirname(__file__), "data")

REQUIRED_PARQUETS = ["teams_historical.parquet", "pressure_curves.parquet", "matches_historical.parquet"]
REQUIRED_JSON = ["regression_results.json", "model_metadata.json"]


def load_app_state():
    for fname in REQUIRED_PARQUETS + REQUIRED_JSON:
        path = os.path.join(DATA_DIR, fname)
        if not os.path.exists(path):
            print(f"FATAL: required data file missing: {path}", file=sys.stderr)
            sys.exit(1)

    state = {
        "teams": pd.read_parquet(os.path.join(DATA_DIR, "teams_historical.parquet")),
        "curves": pd.read_parquet(os.path.join(DATA_DIR, "pressure_curves.parquet")),
        "matches": pd.read_parquet(os.path.join(DATA_DIR, "matches_historical.parquet")),
    }
    with open(os.path.join(DATA_DIR, "regression_results.json")) as f:
        state["regression"] = json.load(f)
    with open(os.path.join(DATA_DIR, "model_metadata.json")) as f:
        state["metadata"] = json.load(f)

    live_path = os.path.join(DATA_DIR, "live_2026.parquet")
    state["live"] = pd.read_parquet(live_path) if os.path.exists(live_path) else pd.DataFrame()

    methodology_path = os.path.join(os.path.dirname(__file__), "..", "docs", "methodology.md")
    if os.path.exists(methodology_path):
        with open(methodology_path, encoding="utf-8") as f:
            state["methodology"] = f.read()
    else:
        state["methodology"] = None

    return state


@asynccontextmanager
async def lifespan(app: FastAPI):
    app.state.app_state = load_app_state()
    app.state.live_refresh_task = asyncio.create_task(refresh_live_data(app))
    yield
    app.state.live_refresh_task.cancel()


app = FastAPI(lifespan=lifespan)

allowed_origins = [o.strip() for o in os.environ.get("ALLOWED_ORIGINS", "").split(",") if o.strip()]
if os.environ.get("ENVIRONMENT") == "development":
    allowed_origins.append("http://localhost:5173")

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(teams.router, prefix="/api")
app.include_router(matches.router, prefix="/api")
app.include_router(live.router, prefix="/api")
app.include_router(methodology.router, prefix="/api")


@app.get("/health")
def health():
    return {"status": "ok"}
