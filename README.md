# LoadedOut — Personal Routine & Nutrition Assistant

A production-grade, multi-platform personal assistant for tracking weekly schedules, logging meals via AI macronutrient estimation, and analyzing workouts. 

The platform ships as both a progressive web application (PWA) and a native Android application using Capacitor, backed by a unified Python API.

[![Python](https://img.shields.io/badge/Python-3.10-blue?logo=python)](https://python.org)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.100+-green?logo=fastapi)](https://fastapi.tiangolo.com)
[![React](https://img.shields.io/badge/React-18-blue?logo=react)](https://react.dev)
[![Capacitor](https://img.shields.io/badge/Capacitor-v8-blue)](https://capacitorjs.com/)
[![Gemini](https://img.shields.io/badge/LLM-Vertex%20AI-orange)](https://cloud.google.com/vertex-ai)
[![Docker](https://img.shields.io/badge/Docker-Compose-blue?logo=docker)](https://docker.com)

---

## Overview

Built to centralize daily habits, LoadedOut uses Vertex AI (Gemini) to remove the friction from health tracking. 

Example features:
- **Instant Nutrition**: Tell the AI *"I ate 200g of grilled chicken and some rice"* and it automatically estimates Calories, Protein, Carbs, and Fats.
- **Smart Workouts**: Log gym routines and receive structured fitness performance checks.
- **Unified Scheduling**: A weekly calendar synced directly with Google Calendar via OAuth 2.0.

---

## Architecture

```text
┌──────────────────────────────────────────────────────────────────────┐
│                              GCP Compute Engine                      │
│                                                                      │
│  ┌─────────────────────────┐                                         │
│  │  Caddy (Reverse Proxy)  │                                         │
│  │  :443 / HTTPS           │                                         │
│  └──────┬─────────────┬────┘                                         │
│         │             │                                              │
│  ┌──────▼─────┐ ┌─────▼───────┐     ┌──────────────────────────┐     │
│  │ FastAPI    │ │ MCP Server  │────▶│ Vertex AI (Gemini Flash) │     │
│  │ :8000      │ │ :8003       │     └──────────────────────────┘     │
│  └──────┬─────┘ └─────┬───────┘                                      │
│         │             │                                              │
│  ┌──────▼─────┐ ┌─────▼──────┐      ┌──────────────────────────┐     │
│  │ PostgreSQL │ │  MongoDB   │      │ Client App (Capacitor)   │     │
│  │ (State)    │ │ (Messages) │      │ Android / iOS / Web      │     │
│  └────────────┘ └────────────┘      └──────────────────────────┘     │
└──────────────────────────────────────────────────────────────────────┘
```

---

## Features

- **Automated Scheduling** — View and control calendar events with infinite scrolling.
- **AI Nutrition Parsing** — Zero-friction macro logging via natural language processing.
- **MCP Integration** — Exposes database context and semantic functionality via the Model Context Protocol (MCP) for autonomous agent chaining.
- **Cross-Platform Native Wrapper** — Deploys as a web app or as a bundled native Android/iOS app.
- **Role-Based Auth** — Custom JWT session management paired with native Google OAuth pipelines.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Backend | Python 3.10+, FastAPI |
| AI | Google Vertex AI (`gemini-1.5-flash` / `gemini-2.0-flash`) |
| Structured DB | PostgreSQL (Async SQLAlchemy) |
| Document DB | MongoDB (Motor) |
| Context Protocol | Anthropic Model Context Protocol (MCP) Server |
| Frontend | React 18, Vite, TailwindCSS |
| Native Wrapper | Ionic Capacitor |
| Containerization | Docker Compose, Caddy Server |

---

## Project Structure

```text
LoadedOut/
├── backend/
│   ├── app/                      # FastAPI core application
│   │   ├── api/                  # REST endpoints (auth, meals, schedule)
│   │   ├── core/                 # Config and security
│   │   └── services/             # AI processing pipelines
│   ├── requirements.txt
│   └── Dockerfile
├── frontend/
│   ├── src/                      # React SPA
│   ├── android/                  # Capacitor native Android bundle
│   ├── capacitor.config.json     # Interop config
│   ├── package.json
│   └── Dockerfile
├── mcp/
│   ├── server.py                 # Standalone MCP protocol server
│   ├── requirements.txt
│   └── Dockerfile
├── infra/
│   ├── docker-compose.prod.yml   # Production compose
│   └── Caddyfile                 # SSL Proxy config
└── README.md
```

---

## Quick Start

### 1. Configure the Environment
Ensure your `.env.prod` is populated inside the `infra/` directory:

```env
APP_NAME=LoadedOut
DEBUG=false
DATABASE_URL=postgresql+asyncpg://user:password@db:5432/db
SECRET_KEY=secure_long_string
ALLOWED_ORIGINS=https://loadedout.online,capacitor://localhost,http://localhost
GCP_PROJECT_ID=your-gcp-project
VERTEX_AI_MODEL=gemini-1.5-flash
```

### 2. Start the Deployment
```bash
cd infra/
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --build
```
Navigate to your application port or configured Caddy domain.

---

## Useful Commands

```bash
# Sync frontend changes to the Android Capacitor build
npm run cap:sync

# View backend production logs
docker compose -f docker-compose.prod.yml logs -f backend

# Update and restart containers
git pull
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --build
```
