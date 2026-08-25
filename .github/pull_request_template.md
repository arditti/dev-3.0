<!-- 1–3 sentences: what changes and why. Link the issue if one exists. -->

## Checklist

Full rules live in [`AGENTS.md`](../AGENTS.md) and [`CONTRIBUTING.md`](../CONTRIBUTING.md); this is the short list of things reviews most often bounce on.

- [ ] Changelog entry under `change-logs/YYYY/MM/DD/` dated to the **expected merge day**, not the day work started (`feature-` entries need a `Short:` line)
- [ ] Rebased on current `origin/main`
- [ ] `bun run lint` clean and the **full** `bun run test` green — not only the files you touched
- [ ] If this change makes an existing `decisions/` record's claims false: supersede note added, new record written
- [ ] If a surface, action, search token, or shortcut changed: the matching registries updated (`docs/ux/`, `src/mainview/keymap.ts`, the search help in `i18n/translations/*/help.ts`, `ask-dev3`, tips)
- [ ] User-facing strings go through `t()` and exist in all three locales (en / ru / es)
- [ ] UI change: manual browser QA done; screenshots taken in streamer mode (`&streamer=on`)
- [ ] New dependency: pinned to an exact version
- [ ] PR is out of draft before requesting review
