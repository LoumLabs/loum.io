#!/bin/bash

# Create dist directory
mkdir -p dist
mkdir -p dist/audio2text

# Copy root files
cp index.html dist/
# Only copy assets if they exist
if [ -d "assets" ]; then
  cp -r assets dist/
fi

# Build audio2text app
cd src/audio2text

# Create public directory if it doesn't exist
mkdir -p public

# Install and build
npm install
npm run build

# Create the correct Next.js output structure
mkdir -p ../../dist/audio2text
cp -r .next ../../dist/audio2text/
if [ -d "public" ]; then
  cp -r public/* ../../dist/audio2text/
fi

echo "Build completed!"
