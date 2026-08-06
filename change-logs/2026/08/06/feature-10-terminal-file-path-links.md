Short: Cmd+Click file paths in terminal

File paths mentioned in terminal output (absolute, ~-relative, or worktree-relative, even when soft-wrapped across lines) are now rendered as underlined links and are Cmd/Ctrl+Clickable — only paths that actually exist on disk become links. A new Settings → Terminal "File path click action" chooses what the click does: preview the file in a dev3 modal (default, with markdown rendering and image support), open it in the OS default app, or reveal it in Finder; browser/remote sessions always use the in-app preview.
