#!/bin/bash
cd ~/apps/protocol-maker/backend
source venv/bin/activate
export $(cat ~/apps/protocol-maker/.env 2>/dev/null | grep -v '^#' | xargs)
uvicorn main:app --host 0.0.0.0 --port 3001
