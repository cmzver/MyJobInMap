#!/usr/bin/env bash
# Kotlin DTO моделей Android из OpenAPI сервера — то же, что gen-android-models.ps1,
# но запускается и в CI (Linux), и в Git Bash на Windows (PS 5.1 спотыкается о stderr).
#
#   PYTHON=server/venv/Scripts/python bash scripts/gen-android-models.sh
#
# Версия генератора закреплена в openapitools.json. Нужны python, node/npx, java.
set -euo pipefail
cd "$(dirname "$0")/.."

PYTHON="${PYTHON:-python}"
OUT=app/src/main/java/com/fieldworker/data/remote/generated
TMP=build/gen-android-tmp

"$PYTHON" server/scripts/dump_openapi.py server/openapi.json >/dev/null

rm -rf "$TMP"
npx --yes "@openapitools/openapi-generator-cli" generate \
    -i server/openapi.json -g kotlin \
    --global-property models,modelDocs=false,modelTests=false \
    --additional-properties=serializationLibrary=kotlinx_serialization,enumPropertyNaming=UPPERCASE,dateLibrary=string,modelPackage=com.fieldworker.data.remote.generated \
    --type-mappings=integer=kotlin.Long,AnyType=JsonElement \
    --import-mappings=JsonElement=kotlinx.serialization.json.JsonElement \
    -o "$TMP" >/dev/null

rm -rf "$OUT"
mkdir -p "$OUT"
cp "$TMP"/src/main/kotlin/com/fieldworker/data/remote/generated/*.kt "$OUT"/
echo "Generated $(ls "$OUT"/*.kt | wc -l) Kotlin models into $OUT"
