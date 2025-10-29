#!/bin/bash
set -e

# Bump version
npm version ${1:-patch}
VERSION=$(node -p "require('./package.json').version")

docker buildx build --platform linux/amd64,linux/arm64 -t rstropek/mcp-mylittlepony:$VERSION -t rstropek/mcp-mylittlepony:latest --push .

az webapp config container set \
  --name app-oo4oxqod5ptc4 \
  --resource-group mcp-mylittlepony \
  --container-image-name rstropek/mcp-mylittlepony:$VERSION

echo "Built rstropek/mcp-mylittlepony:$VERSION"