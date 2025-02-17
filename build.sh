#!/bin/bash

# Create dist directory and copy static files
echo "Setting up static files..."
mkdir -p dist
cp index.html dist/

# Build Next.js app
echo "Building Next.js app..."
cd src/audio2text
npm install
npm run build

# Copy Next.js build to dist
echo "Copying Next.js build..."
mkdir -p ../../dist/audio2text
cp -r .next/* ../../dist/audio2text/

echo "Build complete!"
