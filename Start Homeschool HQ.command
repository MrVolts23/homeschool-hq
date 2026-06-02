#!/bin/bash
# ============================================================
#  Start Homeschool HQ
#  Double-click this file to launch the app.
#  It starts a small local web server and opens the app in
#  your browser. The AI worksheet features need this (they
#  don't work when you open the file directly).
#  Close this Terminal window when you're done to stop it.
# ============================================================

APP_DIR="/Users/mikevolts/Projects/homeschool"
PORT=8765
URL="http://localhost:$PORT/index.html"

cd "$APP_DIR" || { echo "Could not find the app folder at $APP_DIR"; exit 1; }

echo ""
echo "  🌲  Homeschool HQ"
echo "  ------------------------------------------"

# If the server is already running on this port, just open the browser.
if lsof -ti :$PORT >/dev/null 2>&1; then
  echo "  Already running — opening your browser…"
  open "$URL"
  echo "  Open at: $URL"
  echo ""
  echo "  (Another window is hosting the server. You can"
  echo "   close THIS window safely.)"
  exit 0
fi

# Otherwise start the server.
echo "  Starting the local server…"
python3 -m http.server $PORT >/dev/null 2>&1 &
SERVER_PID=$!

# Give it a moment, then open the browser.
sleep 1
open "$URL"

echo "  Open at: $URL"
echo ""
echo "  ✅  Homeschool HQ is running."
echo "  Leave this window open while you use the app."
echo "  When you're done, close this window (or press"
echo "  Control-C) to stop the server."
echo "  ------------------------------------------"
echo ""

# Stop the server cleanly if this window is closed / Ctrl-C.
trap "echo ''; echo '  Stopping Homeschool HQ…'; kill $SERVER_PID 2>/dev/null; exit 0" INT TERM
wait $SERVER_PID
