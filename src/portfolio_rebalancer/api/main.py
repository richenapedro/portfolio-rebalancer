from __future__ import annotations

import os

import uvicorn


def main() -> None:
    uvicorn.run(
        "portfolio_rebalancer.api.app:app",
        host=os.getenv("PRB_HOST", "127.0.0.1"),
        port=int(os.getenv("PRB_PORT", "8000")),
        reload=os.getenv("PRB_RELOAD", "0") == "1",
    )


if __name__ == "__main__":
    main()
