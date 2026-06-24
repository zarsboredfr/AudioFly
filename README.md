# AudioFly

A web-based YouTube to MP3 downloader with a developer API hub.

## Setup

1. Install dependencies:

   npm install

2. Start the server:

   npm start

3. Open `http://localhost:3000`

## Features

- Home page for YouTube MP3 conversion
- Updates hub with editable `public/updates.json`
- Developer API key creation and `/api/download` access

## Developer API

Create a key:

POST /api/create-key
Content-Type: application/json

{ "name": "My App" }

Download using a key:

GET /api/download?url={YOUTUBE_URL}&key={API_KEY}

## Deploy to Render

Render will use `npm install` and `npm start` automatically. Add `render.yaml` to configure the service.
