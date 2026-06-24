from fastapi import APIRouter, HTTPException, Request

router = APIRouter()


@router.get("/methodology")
def get_methodology(request: Request):
    content = request.app.state.app_state["methodology"]
    if not content:
        raise HTTPException(status_code=503, detail="Methodology content not available")
    return {"content": content}


@router.get("/regression")
def get_regression(request: Request):
    return request.app.state.app_state["regression"]
