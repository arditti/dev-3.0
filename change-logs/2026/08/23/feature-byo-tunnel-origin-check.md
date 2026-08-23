Short: Remote access behind any tunnel

First step toward bring-your-own-tunnel remote access (ngrok-style providers alongside the built-in Cloudflare quick tunnel): the remote-access origin check now also accepts an Origin matching X-Forwarded-Host, so Host-rewriting tunnel proxies no longer break browser auth and WebSocket upgrades.
