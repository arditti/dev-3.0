Short: Clickable hyperlinks in the terminal

Markdown links that agents print in the terminal (OSC 8 hyperlinks, e.g. Claude Code's PR/issue references) are now Cmd/Ctrl+Click-able. tmux forwards OSC 8 to the renderer via the `hyperlinks` terminal feature, and `FORCE_HYPERLINK=1` in the task environment opts hyperlink-capable CLIs into emitting them.
