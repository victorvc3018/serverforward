#!/bin/bash
# Stop script for Termux / Linux

if pgrep -f "node index.js" > /dev/null; then
  echo "🛑 Stopping Discord bot..."
  pkill -f "node index.js"
  sleep 1
  if pgrep -f "node index.js" > /dev/null; then
    pkill -9 -f "node index.js"
  fi
  echo "✅ Bot has been stopped."
else
  echo "ℹ️ Bot is not running."
fi

# Release wake lock in Termux if idle
if command -v termux-wake-unlock &> /dev/null; then
  termux-wake-unlock
fi
