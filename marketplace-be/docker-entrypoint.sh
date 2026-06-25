#!/bin/bash
set -e

SHARED_DIR="/shared"
CONTRACTS_DIR="/usr/src/app/dist/contracts"

echo "=========================================="
echo "  Backend NestJS - Entrypoint"
echo "=========================================="

# Esperar a que el deploy de contratos termine
echo "Waiting for contract deployment..."
MAX_WAIT=120
WAITED=0
while [ ! -f "$SHARED_DIR/.deployed" ]; do
  WAITED=$((WAITED + 2))
  if [ $WAITED -ge $MAX_WAIT ]; then
    echo "WARNING: Timeout waiting for deployment after ${MAX_WAIT}s. Starting with existing config..."
    break
  fi
  echo "  Waiting... (${WAITED}s / ${MAX_WAIT}s)"
  sleep 2
done

if [ -f "$SHARED_DIR/.deployed" ]; then
  echo "Contract deployment detected!"

  # Cargar direcciones de contratos desde el volumen compartido
  if [ -f "$SHARED_DIR/contracts.env" ]; then
    echo "Loading contract addresses from shared volume..."
    while IFS= read -r line; do
      # Ignorar comentarios y lineas vacias
      case "$line" in
        \#*|"") continue ;;
      esac
      export "$line"
      echo "  Set: ${line%%=*}"
    done < "$SHARED_DIR/contracts.env"
    echo "Contract addresses loaded!"
  fi

  # Copiar ABIs actualizados al directorio de contratos del backend
  if [ -d "$SHARED_DIR/contracts" ]; then
    echo "Updating contract ABIs from shared volume..."
    mkdir -p "$CONTRACTS_DIR"
    cp "$SHARED_DIR/contracts/"*.json "$CONTRACTS_DIR/" 2>/dev/null && \
      echo "ABIs updated successfully!" || \
      echo "WARNING: No ABI files found to copy"
    echo "Files in contracts dir:"
    ls -la "$CONTRACTS_DIR/"*.json 2>/dev/null || true
  fi
fi

echo ""
echo "Starting NestJS application..."
echo "=========================================="
exec node dist/main
