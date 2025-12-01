#!/bin/bash
cd ~/apps/protocol-maker
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"
export NODE_ENV=production
export PORT=3000
node dist/index.js
