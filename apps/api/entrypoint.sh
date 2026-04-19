#!/bin/sh
set -e

echo "Running DB init..."
node dist/db/init.js

echo "Starting server..."
exec node dist/index.js
