#!/usr/bin/env python
"""
Run FastAPI server without reload (for testing)
"""
import uvicorn

if __name__ == "__main__":
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=8001,
        reload=False,  # Disable reload to prevent restart on file changes
        log_level="info",
    )
