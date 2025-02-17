#!/bin/bash

# Create dist directory
mkdir -p dist
mkdir -p dist/audio2text

# Copy root files
cp index.html dist/
cp -r assets dist/

# Build audio2text app
cd src/audio2text
npm install
npm run build

# Copy audio2text build to dist
cp -r .next/* ../../dist/audio2text/
cp -r public/* ../../dist/audio2text/

echo "Build completed!"
