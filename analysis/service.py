"""FastAPI analysis service. Used by docker-compose (ANALYSIS_SERVICE_URL=http://analysis:8000)."""
from fastapi import FastAPI
from pydantic import BaseModel

from engine import ENGINE_VERSION, analyze

app = FastAPI(title="Prospect Analysis Engine", version=ENGINE_VERSION)


class AnalyzeRequest(BaseModel):
    model_config = {"extra": "allow"}
    task_type: str = "descriptive"


@app.get("/health")
def health():
    return {"ok": True, "engine_version": ENGINE_VERSION}


@app.post("/analyze")
def run(req: AnalyzeRequest):
    return analyze(req.model_dump())
