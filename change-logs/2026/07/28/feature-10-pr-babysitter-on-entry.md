Short: PR Babysitter agent for open PRs

Added the PR Babysitter (phase 1): entering the PR Review column can now launch a babysitter agent that triages the open pull request — conflicts first, then CI, then review comments — with a prompt composed from new per-project knobs (Autonomy Off/Triage/Fix/Land, Handle-comments toggle, per-capability overrides) configured in Project Settings → Project Config and shareable via .dev3/config.json. Hard safety ceilings (never merge, never approve, never edit CI/tests to go green) are baked into every generated prompt.
