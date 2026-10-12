# Local Keycloak for the OAuth samples

The OAuth samples ([`../day4/McpStreamableAuth`](../day4/McpStreamableAuth/readme.md) and [`../day4-dotnet`](../day4-dotnet/README.md)) need an authorization server. This folder runs one locally with Docker: [Keycloak](https://www.keycloak.org/) **26.8.0** with a preconfigured realm, so the samples work without any cloud account.

```bash
cd keycloak
docker compose up -d --wait     # first start imports the realm (takes ~30 s)
docker compose down             # stop, keeps the data
docker compose down -v          # stop and reset to the realm file
```

Demo setup only: plain HTTP on loopback, demo passwords, embedded H2 database.

## What is configured

| | |
| --- | --- |
| Issuer | `http://localhost:8080/realms/mcp-webinar` |
| Admin console | `http://localhost:8080/admin/` — `admin` / `admin` |
| Demo user | `demo` / `demo` |
| MCP server (resource) | `http://localhost:3000/mcp` — both day 4 servers run on port 3000 |
| Scope | `ponypwd:generate` (optional, i.e. granted only when requested) |

The realm is defined in [`mcp-webinar-realm.json`](mcp-webinar-realm.json) and imported on the **first** start. Keycloak skips the import when the realm already exists, so after changing the file run `docker compose down -v` and start again.

Keycloak's support for two MCP-relevant standards is still experimental and is switched on in [`compose.yaml`](compose.yaml) with `--features=cimd,resource-indicators`:

- **Resource Indicators (RFC 8707)**: a client sends `resource=http://localhost:3000/mcp`, and Keycloak issues a token whose `aud` is exactly that URL. Keycloak only accepts resource URLs it knows: the bearer-only client `http://localhost:3000/mcp` with the attribute `resource_url` represents the MCP server. Any other `resource` value is rejected with `invalid_target`.
- **Client ID Metadata Documents (CIMD)**: an MCP client identifies itself with an HTTPS URL as `client_id`, and Keycloak fetches the client's metadata document from there. No registration step.

## Clients

| Client | Registration | Notes |
| --- | --- | --- |
| [MCPJam](https://www.mcpjam.com/) | CIMD, `https://www.mcpjam.com/.well-known/oauth/client-metadata.json` | Client policy `cimd-mcpjam` |
| VS Code | CIMD, `https://vscode.dev/oauth/client-metadata.json` | Client policy `cimd-vscode` |
| Claude Code | CIMD, `https://claude.ai/oauth/claude-code-client-metadata` | Client policy `cimd-claude` |
| [MCP Inspector](https://github.com/modelcontextprotocol/inspector) | Pre-registered public client `mcp-inspector` | Redirect URI `http://localhost:6274/oauth/callback` or `http://127.0.0.1:6274/oauth/callback` |
| `curl` | Pre-registered confidential client `mcp-cli`, secret `mcp-cli-secret` | `client_credentials` grant, no user involved |

Each CIMD client policy only matches `client_id` URLs on the client's own domain and lists the domains its metadata document may reference. Its *Resource indicator allow list* (new in Keycloak 26.8) contains `http://localhost:3000/mcp`; for an accepted `resource`, Keycloak adds the matching `aud` claim to the client automatically. The two pre-registered clients get the same `aud` from an audience mapper. A separate policy requires PKCE for every client.

Dynamic Client Registration (RFC 7591) is not set up. The 2026-07-28 revision of MCP deprecates it in favour of CIMD.

## Getting a token with curl

```bash
TOKEN=$(curl -s http://localhost:8080/realms/mcp-webinar/protocol/openid-connect/token \
  -d grant_type=client_credentials -d client_id=mcp-cli -d client_secret=mcp-cli-secret \
  -d scope=ponypwd:generate | jq -r .access_token)
```

Leave out `-d scope=ponypwd:generate` to get a token without the scope: it can call the MCP server, but not the tools that require the scope.

## Gotchas

- **Port 8080** must be free. `docker compose up` fails with "port is already allocated" otherwise.
- **The issuer is always `http://localhost:8080/realms/mcp-webinar`**, no matter whether a request goes to `localhost` or `127.0.0.1` (`KC_HOSTNAME` in `compose.yaml`). The MCP servers compare the `iss` claim with exactly this URL.
- **After `docker compose down -v`** the signing keys are new. Restart the MCP server (or wait for its key cache to refresh) and reconnect the MCP clients, so they fetch new tokens.
- **Stale client state.** MCP clients cache OAuth discovery results per server URL. If a client was connected to `http://localhost:3000/mcp` with another authorization server before, clear its stored OAuth data for that server.
