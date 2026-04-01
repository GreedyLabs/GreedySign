#!/bin/sh
set -e

echo "Running DB init..."
node src/db/init.js

echo "Starting server..."
exec node src/index.js
