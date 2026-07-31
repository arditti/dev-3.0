Short: Per-project env vars for agents

Project Settings now has an Environment Variables editor, also configurable in .dev3/config.json and .dev3/config.local.json with per-key merging. The variables are exported into the project terminal, every agent terminal, setup/dev/cleanup script, and column agent of the project's tasks. This field is not for secrets; the editor identifies whether its storage is local-only or committed.
