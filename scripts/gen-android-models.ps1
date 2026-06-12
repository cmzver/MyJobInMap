# Generates Kotlin DTO models from the server OpenAPI schema.
# Android counterpart of the portal's `npm run gen:api`.
#
# Pipeline: dump server OpenAPI -> openapi-generator (kotlin, kotlinx.serialization,
# models-only) -> checked-in package com.fieldworker.data.remote.generated.
#
# Config rationale:
#   serializationLibrary=kotlinx_serialization  - matches the app's Retrofit converter
#   dateLibrary=string                          - dates stay String (app convention; no java.time desugaring)
#   integer=kotlin.Long                         - ids as Long (server schema omits int64 format)
#   AnyType=JsonElement                         - freeform object fields -> JsonElement (kotlinx-serializable)
#   enumPropertyNaming=UPPERCASE                - PLANNED/CURRENT/... enum entries
#
# Requires: python, node/npx, java. Run from the repo root.
$ErrorActionPreference = "Stop"

$out = "app/src/main/java/com/fieldworker/data/remote/generated"
$tmp = "build/gen-android-tmp"

python server/scripts/dump_openapi.py server/openapi.json

Remove-Item -Recurse -Force $tmp -ErrorAction SilentlyContinue
npx --yes "@openapitools/openapi-generator-cli" generate `
    -i server/openapi.json -g kotlin `
    --global-property models,modelDocs=false,modelTests=false `
    --additional-properties=serializationLibrary=kotlinx_serialization,enumPropertyNaming=UPPERCASE,dateLibrary=string,modelPackage=com.fieldworker.data.remote.generated `
    --type-mappings=integer=kotlin.Long,AnyType=JsonElement `
    --import-mappings=JsonElement=kotlinx.serialization.json.JsonElement `
    -o $tmp

Remove-Item -Recurse -Force $out -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Force -Path $out | Out-Null
Copy-Item "$tmp/src/main/kotlin/com/fieldworker/data/remote/generated/*.kt" $out

Write-Host "Generated $((Get-ChildItem $out -Filter *.kt).Count) Kotlin models into $out"
