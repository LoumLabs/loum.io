#!/bin/bash

# Build the Next.js app
cd src/audio2text
npm install
npm run build
npm run export

# Copy the exported files to the root audio2text directory
mkdir -p ../../audio2text
cp -r out/* ../../audio2text/
