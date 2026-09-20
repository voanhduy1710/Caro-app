# Caro Web App

A modern, high-performance, real-time **Caro (Gomoku / Five-in-a-Row)** web application built with **React 19**, **TypeScript**, **Tailwind CSS v4**, and **WebRTC (PeerJS)**, backed by **Supabase** for user authentication, ELO ratings, and leaderboard persistence.

---

## Features

- **1v1 Classic**
- **1v1v1 (4 in a row)**
- **Lmao mode**
- **Coordinates**
- **Unlimited time choices**
- **Move simulations**
- **Real live chatting**
- **Sending memes and GIFs**

---

## Tech Stack

| Category | Technologies |
| :--- | :--- |
| **Frontend Framework** | [React 19](https://react.dev/), [TypeScript](https://www.typescriptlang.org/) |
| **Build Tool & Bundler** | [Vite 6+](https://vite.dev/) |
| **Styling & Icons** | [Tailwind CSS v4](https://tailwindcss.com/), [Lucide React](https://lucide.dev/) |
| **P2P Networking** | [PeerJS](https://peerjs.com/) (WebRTC Data Channels) |
| **Backend & Database** | [Supabase](https://supabase.com/) (Auth, PostgreSQL, Storage, REST API) |
| **Testing & Tooling** | [Vitest](https://vitest.dev/), [Oxlint](https://oxc.rs/), Playwright / Headless Chrome E2E suite |

---

## Quick Start

### 1. Prerequisites
- [Node.js](https://nodejs.org/) (v18.0 or higher recommended)
- `npm` or `pnpm`

### 2. Clone and Install Dependencies
```bash
git clone https://github.com/voanhduy1710/Caro-app.git
cd Caro-app
npm install
```

### 3. Configure Environment Variables
Copy the example environment file and fill in your Supabase project credentials:
```bash
cp .env.example .env
```
Edit `.env`:
```env
# Optional Vercel token for CLI deployment
VERCEL_ACCESS_TOKEN=your_vercel_token_here

# Supabase Project Configuration
VITE_SUPABASE_URL=https://your-project-id.supabase.co
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key_here
```

### 4. Run Locally
Start the development server:
```bash
npm run dev
```
Open [http://localhost:5175](http://localhost:5175) in your browser.

---

## PowerShell Helper Scripts

For Windows developers, automated PowerShell workflows are provided in the repository root:

- **`.\deploy_local.ps1`**: Installs dependencies (if missing) and starts the Vite dev server on strict port `5175`.
- **`.\clean_restart.ps1`**: Gracefully terminates any orphaned process holding port `5175` before launching a fresh dev instance.
- **`.\deploy_vercel.ps1`**: Runs a clean production build check (`npm run build`) and publishes directly to Vercel via CLI token.

---

## Testing & Code Quality

```bash
# Run unit tests via Vitest
npm test

# Run the Room Engine headless E2E simulation suite
npm run e2e:room

# Run fast linter checks via Oxlint
npm run lint

# Check TypeScript types and build bundle
npm run build
```

---

## Project Structure

```text
Caro-app/
├── public/               # Static assets, sound effects, avatars & minigame sprites
├── scripts/              # Automated E2E room test scripts
├── src/
│   ├── app/              # Root App, View routing & layout wrappers
│   ├── config/           # Application & Supabase client configuration
│   ├── features/
│   │   ├── auth/         # Supabase Auth provider, modals & credentials management
│   │   ├── avatar/       # Avatar selection & storage bucket integration
│   │   ├── game/         # Board matrix, cell rendering, move logic & controls
│   │   ├── history/      # Match history & claims viewer
│   │   ├── leaderboard/  # ELO leaderboard display & rank tracking
│   │   ├── minigames/    # Retro Coin Flip & Stone RPS pre-match turn deciders
│   │   ├── profile/      # Player profile modal & stat editor
│   │   ├── room/         # P2P Room engine, state machine, timers, and roster
│   │   ├── settings/     # Room settings & board theme preferences
│   │   ├── theme/        # Theme provider & UI theme switches
│   │   └── webrtc/       # PeerJS connection orchestration & event bus
│   ├── shared/           # Reusable UI components, hooks, sound triggers & utilities
│   ├── styles/           # Tailwind CSS v4 design tokens and global themes
│   └── main.tsx          # Application entry point
├── supabase/             # Database reference guides & SQL setup templates
└── package.json          # Project metadata and dependencies
```
