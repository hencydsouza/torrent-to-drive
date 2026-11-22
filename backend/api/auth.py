"""In-app Google sign-in, so a prebuilt image needs no CLI login.

1. PUT /client   – save the OAuth client JSON (from Google Cloud Console) into the config volume.
2. POST /login   – get Google's consent URL.
3. Google redirects to GET /callback, or, when that redirect can't reach the app (Desktop clients only
   redirect to localhost), the user pastes the final URL into POST /finish.
"""
import asyncio
import json
import logging
import os
from typing import Dict
from urllib.parse import parse_qs, urlparse

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import RedirectResponse
from google_auth_oauthlib.flow import Flow
from pydantic import BaseModel

from backend.config import settings
from backend.drive.client import SCOPES, get_drive_client, reset_drive_client, save_token, write_private
from backend.models import AuthStatus

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/auth", tags=["auth"])

os.environ.setdefault("OAUTHLIB_RELAX_TOKEN_SCOPE", "1")  # Google may return scopes in a different order

_pending: Dict[str, Flow] = {}  # OAuth state -> flow (holds the PKCE verifier)


class ClientUpload(BaseModel):
    client_json: str


class FinishRequest(BaseModel):
    url: str


def _creds_file() -> str:
    return settings.google_drive.credentials_file


def _redirect_uri(request: Request) -> str:
    base = str(request.base_url).rstrip("/")
    if request.url.hostname not in ("localhost", "127.0.0.1") and not base.startswith("https://"):
        # Google only redirects plain http to localhost. From another machine the redirect then fails to
        # load, and the user pastes that URL into /finish instead.
        base = f"http://localhost:{request.url.port or 80}"
    return f"{base}/api/auth/callback"


@router.get("/status", response_model=AuthStatus)
async def status(request: Request):
    adc = os.getenv("GOOGLE_AUTH") == "adc"
    out = AuthStatus(mode="adc" if adc else "oauth", has_client=adc or os.path.exists(_creds_file()),
                     connected=False, redirect_uri=_redirect_uri(request))
    try:
        drive = await get_drive_client()
        out.connected = True
        out.account = await drive.account()
    except Exception as e:
        out.error = str(e)
    return out


@router.put("/client", response_model=AuthStatus)
async def upload_client(body: ClientUpload, request: Request):
    try:
        data = json.loads(body.client_json)
        cfg = data.get("installed") or data.get("web")
        assert cfg and cfg.get("client_id") and cfg.get("client_secret")
    except (ValueError, AssertionError, AttributeError):
        raise HTTPException(400, "Not an OAuth client file. Download it from Google Cloud Console → Credentials.")
    write_private(_creds_file(), json.dumps(data))
    reset_drive_client()
    return await status(request)


@router.post("/login")
async def login(request: Request):
    if not os.path.exists(_creds_file()):
        raise HTTPException(400, "Upload your OAuth client file first.")
    flow = Flow.from_client_secrets_file(_creds_file(), SCOPES, redirect_uri=_redirect_uri(request))
    url, state = flow.authorization_url(access_type="offline", prompt="consent")
    _pending.clear()  # one sign-in at a time; older links stop working
    _pending[state] = flow
    return {"url": url}


async def _finish(code: str, state: str):
    flow = _pending.pop(state, None)
    if not flow:
        raise HTTPException(400, "This sign-in link expired. Click Sign in again.")
    try:
        # code= instead of authorization_response= so http://localhost redirects are accepted
        await asyncio.to_thread(flow.fetch_token, code=code)
    except Exception as e:
        raise HTTPException(400, f"Google rejected the sign-in: {e}")
    save_token(flow.credentials, settings.google_drive.token_file)
    reset_drive_client()
    logger.info("Google Drive connected via in-app sign-in")


@router.get("/callback", include_in_schema=False)
async def callback(code: str = "", state: str = "", error: str = ""):
    if error or not code:
        return RedirectResponse(f"/settings?google=error&reason={error or 'no_code'}")
    try:
        await _finish(code, state)
    except HTTPException as e:
        return RedirectResponse(f"/settings?google=error&reason={e.detail}")
    return RedirectResponse("/settings?google=connected")


@router.post("/finish", response_model=AuthStatus)
async def finish(body: FinishRequest, request: Request):
    q = parse_qs(urlparse(body.url.strip()).query)
    if "code" not in q or "state" not in q:
        raise HTTPException(400, "That URL has no sign-in code. Copy the whole address after approving access.")
    await _finish(q["code"][0], q["state"][0])
    return await status(request)


@router.post("/logout", response_model=AuthStatus)
async def logout(request: Request):
    token = settings.google_drive.token_file
    if os.path.exists(token):
        os.remove(token)
    reset_drive_client()
    return await status(request)
