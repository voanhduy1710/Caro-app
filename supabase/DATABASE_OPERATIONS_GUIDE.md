# Supabase Database Operations & Reference Guide

This guide documents how database queries and mutations are executed for this project, how authentication is configured, and how to query or update user and game data in the future.

---

## 1. Project Configuration & Standards

- **Supabase Project Reference**: `vghzpispxkgkdqqsuosp`
- **Database Table Naming Rule**: All application database tables use the `gomoku_` prefix:
  - `gomoku_users`: Player profiles, ELO rating, win/loss records, streaks, avatars.
  - `gomoku_matches`: Match records, boards, moves, and match state.
  - `gomoku_game_seats`: Active seats and turns in a match.
  - `gomoku_match_claims`: Result claims and win validation.
- **Supabase Auth Schema**:
  - `auth.users`: User accounts, emails, hashed passwords (`encrypted_password`), and user metadata.

---

## 2. Authentication & Credentials

The access token is stored in the workspace configuration file [`.mcp.json`](../.mcp.json):

```json
{
  "mcpServers": {
    "supabase-mcp-server": {
      "command": "npx",
      "args": [
        "-y",
        "@supabase/mcp-server-supabase@latest",
        "--access-token",
        "<REDACTED_SUPABASE_PAT>"
      ],
      "env": {
        "SUPABASE_ACCESS_TOKEN": "<REDACTED_SUPABASE_PAT>"
      }
    }
  }
}
```

The management API allows direct SQL execution against the database via HTTP:
- **Endpoint**: `POST https://api.supabase.com/v1/projects/vghzpispxkgkdqqsuosp/database/query`
- **Headers**:
  - `Authorization: Bearer <SUPABASE_ACCESS_TOKEN>`
  - `Content-Type: application/json`
- **Payload**:
  ```json
  {
    "query": "<SQL STATEMENT>"
  }
  ```

---

## 3. How We Queried the Data

### Step 3.1: Discovering Application Tables
```sql
SELECT table_schema, table_name 
FROM information_schema.tables 
WHERE table_schema IN ('public', 'auth') 
  AND (table_name LIKE 'gomoku_%' OR table_name LIKE '%user%')
ORDER BY table_schema, table_name;
```

### Step 3.2: Querying Signed-Up Users
To view all authenticated users:
```sql
SELECT id, email, raw_user_meta_data, created_at 
FROM auth.users 
ORDER BY created_at ASC;
```

To view corresponding game profiles and stats:
```sql
SELECT uid, username, display_name, elo, wins, losses, draws, streak, photo_url, created_at, updated_at
FROM gomoku_users 
ORDER BY created_at ASC;
```

---

## 4. How We Modified the Data

### Step 4.1: Resetting a User's Password
Supabase Auth uses Blowfish (`bcrypt`) encryption stored in `auth.users.encrypted_password`. We updated `test_user`'s password to `123456` using PostgreSQL's `pgcrypto` function:

```sql
UPDATE auth.users 
SET encrypted_password = crypt('123456', gen_salt('bf')),
    updated_at = NOW()
WHERE email = 'user@example.com'
RETURNING id, email, updated_at;
```

#### Verifying Password Reset
Tested via Supabase Auth REST API (`/auth/v1/token?grant_type=password`) using `VITE_SUPABASE_ANON_KEY` from `.env`:
```http
POST https://vghzpispxkgkdqqsuosp.supabase.co/auth/v1/token?grant_type=password
apikey: <VITE_SUPABASE_ANON_KEY>
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "123456"
}
```
Result: Returned `200 OK` with valid JWT tokens.

---

### Step 4.2: Updating Player ELO & Match Records
To increase `player_one`'s ELO by 50 (+2 Wins) and decrease `test_user`'s ELO by 50 (+2 Losses):

```sql
-- Update player_one (+50 ELO, +2 Wins, +2 Streak)
UPDATE gomoku_users 
SET elo = elo + 50,
    wins = wins + 2,
    streak = streak + 2,
    updated_at = NOW()
WHERE username = 'player_one'
RETURNING uid, username, display_name, elo, wins, losses, streak;

-- Update test_user (-50 ELO, +2 Losses, Reset Streak to 0)
UPDATE gomoku_users 
SET elo = elo - 50,
    losses = losses + 2,
    streak = 0,
    updated_at = NOW()
WHERE username = 'test_user'
RETURNING uid, username, display_name, elo, wins, losses, streak;
```

---

## 5. Reusable Execution Script Template

Save and run this Node.js script whenever you need to execute arbitrary SQL or inspect tables:

```javascript
// query_supabase.js
const https = require('https');
const fs = require('fs');
const path = require('path');

// 1. Read token dynamically from .mcp.json
const mcpPath = path.resolve(__dirname, '../.mcp.json');
const mcpConfig = JSON.parse(fs.readFileSync(mcpPath, 'utf8'));
const serverConfig = mcpConfig.mcpServers['supabase-mcp-server'];
const token = serverConfig.args[3] || serverConfig.env.SUPABASE_ACCESS_TOKEN;
const projectRef = 'vghzpispxkgkdqqsuosp';

function executeSql(query) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify({ query });
    const req = https.request({
      hostname: 'api.supabase.com',
      port: 443,
      path: `/v1/projects/${projectRef}/database/query`,
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data)
      }
    }, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(body) });
        } catch (err) {
          resolve({ status: res.statusCode, raw: body });
        }
      });
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

// Example usage:
async function run() {
  const result = await executeSql(`
    SELECT username, display_name, elo, wins, losses 
    FROM gomoku_users;
  `);
  console.log(result.data);
}

run().catch(console.error);
```

---

## 6. Common Gotchas & Troubleshooting

1. **Token Invalidation / Expiration**:
   - If queries return `401 Unauthorized`, verify that the token in `.mcp.json` is still valid by sending a GET request to `https://api.supabase.com/v1/projects`.
2. **MCP Process Lock**:
   - If the IDE reports `exit status 0xffffffff` on MCP calls, an existing background node process might be holding the socket. Stop orphaned `@supabase/mcp-server-supabase` node instances via PowerShell:
     ```powershell
     Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -like '*@supabase/mcp-server-supabase*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }
     ```
3. **Table Prefix Requirement**:
   - Always prefix project tables with `gomoku_`. Avoid unqualified table names like `users` (which refers to Postgres internal views or might collide with `auth.users`).
