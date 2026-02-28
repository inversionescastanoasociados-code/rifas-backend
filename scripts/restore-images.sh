#!/bin/bash
# Script para restaurar imágenes locales al servidor remoto
# Uso: ./scripts/restore-images.sh
# Requiere: curl, jq (opcional)

API_BASE="${API_URL:-https://rifas-backend-production.up.railway.app}"
STORAGE_DIR="$(dirname "$0")/../storage"
EMAIL="${ADMIN_EMAIL:-admin@rifas.com}"
PASSWORD="${ADMIN_PASSWORD:-admin123}"

echo "🔐 Autenticando en $API_BASE..."
TOKEN=$(curl -s -X POST "$API_BASE/api/auth/login" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\"}" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('token','') or d.get('data',{}).get('token',''))" 2>/dev/null)

if [ -z "$TOKEN" ]; then
  echo "❌ Error de autenticación"
  exit 1
fi
echo "✅ Autenticado"

echo ""
echo "📁 Subiendo imágenes desde: $STORAGE_DIR"
echo ""

COUNT=0
for file in "$STORAGE_DIR"/*.{jpg,jpeg,png,webp,gif} 2>/dev/null; do
  [ -f "$file" ] || continue
  FILENAME=$(basename "$file")
  
  echo -n "  📷 $FILENAME... "
  
  RESPONSE=$(curl -s -X POST "$API_BASE/api/uploads/restore" \
    -H "Authorization: Bearer $TOKEN" \
    -F "imagen=@$file" \
    -F "filename=$FILENAME")
  
  OK=$(echo "$RESPONSE" | python3 -c "import sys,json; print(json.load(sys.stdin).get('ok',False))" 2>/dev/null)
  
  if [ "$OK" = "True" ]; then
    echo "✅"
    COUNT=$((COUNT + 1))
  else
    echo "❌ $RESPONSE"
  fi
done

echo ""
echo "🎉 $COUNT imágenes restauradas"
