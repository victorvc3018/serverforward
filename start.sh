#!/bin/bash
# Start script for Termux / Linux

# Acquire wake lock if running in Termux
if command -v termux-wake-lock &> /dev/null; then
  termux-wake-lock
fi

# Check if already running
if pgrep -f "node index.js" > /dev/null; then
  echo "⚠️ Bot is already running!"
  exit 0
fi

echo "🚀 Starting Discord bot in background..."
nohup node index.js > bot.log 2>&1 &
PID=$!

sleep 1
if ps -p $PID > /dev/null; then
  echo "✅ Bot started successfully! (PID: $PID)"
  echo "📄 To view live logs: tail -f bot.log"
  echo "🛑 To stop the bot: ./stop.sh"
else
  echo "❌ Failed to start bot. Check bot.log for details:"
  cat bot.log
fi
