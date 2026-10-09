#!/bin/bash
# Status check script for Termux / Linux

if pgrep -f "node index.js" > /dev/null; then
  echo "🟢 Bot is currently RUNNING."
  echo "📄 To view logs: tail -f bot.log"
  echo "🛑 To stop: ./stop.sh"
else
  echo "🔴 Bot is STOPPED."
  echo "🚀 To start: ./start.sh"
fi
