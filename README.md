# Othello Bot - MCP Webinar Project

This is a starter project for building an AI-powered Othello (Reversi) game bot. The project consists of three TypeScript packages organized as a monorepo using npm workspaces.

## Project Structure

- **othello-game**: Core game logic library for Othello/Reversi
- **othello-cli**: Command-line interface for playing Othello
- **othello-bot**: AI bot that plays Othello using OpenAI's API

## Prerequisites

- Node.js (current LTS recommended)
- npm (comes with Node.js)
- An OpenAI API key

## Getting Started

### 1. Install Dependencies

First, install all dependencies for the monorepo and all workspaces:

```bash
npm install
```

This will install dependencies for all three packages in the workspace.

### 2. Build All Projects

Build all packages in the correct order:

```bash
npm run build
```

This command builds all workspaces (`othello-game`, `othello-cli`, and `othello-bot`).

### 3. Configure Environment Variables

The `othello-bot` package requires an OpenAI API key to function. Create a `.env` file in the `othello-bot` directory:

```bash
cd othello-bot
```

Create a `.env` file with the following content:

```
OPENAI_API_KEY=your_openai_api_key_here
```

Replace `your_openai_api_key_here` with your actual OpenAI API key.

### 4. Run the Othello Bot

To run the othello-bot:

```bash
cd othello-bot
npm start
```

This will:
1. Build the TypeScript code
2. Run the bot using the OpenAI API to make moves

