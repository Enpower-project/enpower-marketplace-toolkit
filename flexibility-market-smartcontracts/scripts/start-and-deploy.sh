#!/bin/bash
set -e

echo "=========================================="
echo "  Hardhat Node - Start & Deploy"
echo "=========================================="

# Limpiar señal de deploy anterior
rm -f /shared/.deployed

# Instalar dependencias
echo "Installing dependencies..."
npm ci

# Iniciar nodo Hardhat en background
echo "Starting Hardhat node..."
npx hardhat node --hostname 0.0.0.0 --port 8545 &
HARDHAT_PID=$!

# Esperar a que el nodo esté listo
echo "Waiting for Hardhat node to be ready..."
MAX_RETRIES=30
RETRIES=0
until node -e "const s = require('net').createConnection(8545, 'localhost'); s.on('connect', () => { s.destroy(); process.exit(0); }); s.on('error', () => process.exit(1));" 2>/dev/null; do
  RETRIES=$((RETRIES + 1))
  if [ $RETRIES -ge $MAX_RETRIES ]; then
    echo "ERROR: Hardhat node did not start after ${MAX_RETRIES} attempts"
    exit 1
  fi
  echo "  Attempt $RETRIES/$MAX_RETRIES..."
  sleep 2
done
echo "Hardhat node is ready!"

# Compilar contratos
echo ""
echo "Compiling contracts..."
npx hardhat compile

# Desplegar contratos (SHARED_DIR se pasa como env var en docker-compose)
echo ""
echo "Deploying contracts..."
npx hardhat run scripts/deploy.ts --network localhost

echo ""
echo "=========================================="
echo "  Deployment complete! Node running..."
echo "=========================================="

# Mantener el nodo corriendo
wait $HARDHAT_PID
