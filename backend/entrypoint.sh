#!/bin/sh
set -e

# Ensure uploads directory exists
mkdir -p /app/uploads

# Run Alembic migrations if alembic is configured
echo "Checking and applying database migrations..."
if alembic upgrade head; then
    echo "Database migrations applied successfully."
else
    echo "Warning: Alembic migration failed or no migrations found. Continuing..."
fi

# Execute the passed container command (e.g. uvicorn)
exec "$@"
