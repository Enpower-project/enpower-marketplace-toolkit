#!/bin/sh

echo "📦 Entrando en /usr/src/app"
cd /usr/src/app

# Si no hay node_modules, instalamos dependencias
if [ ! -d "node_modules" ]; then
  echo "📦 Instalando dependencias..."
  npm install --legacy-peer-deps
else
  echo "✅ Dependencias ya instaladas, continuando..."
fi

# Ejecutamos la aplicación
echo "🚀 Iniciando aplicación NestJS..."
npm run start:dev