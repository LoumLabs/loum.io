#!/bin/bash

# Create dist directory
mkdir -p dist

# Copy root files
cp index.html dist/
if [ -d "assets" ]; then
  cp -r assets dist/
fi

# Build audio2text app
cd src/audio2text

# Install and build
npm install
npm run build

# Copy the static export to dist
cp -r out/* ../../dist/

echo "Build completed!"
