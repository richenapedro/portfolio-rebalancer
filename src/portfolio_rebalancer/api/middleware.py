from __future__ import annotations

import uuid
from typing import Callable

from fastapi import Request, Response

REQUEST_ID_HEADER = "X-Request-Id"


async def request_id_middleware(request: Request, call_next: Callable) -> Response:
    request_id = request.headers.get(REQUEST_ID_HEADER) or str(uuid.uuid4())

    # salva no state para uso nos endpoints
    request.state.request_id = request_id

    response: Response = await call_next(request)
    response.headers[REQUEST_ID_HEADER] = request_id
    return response
