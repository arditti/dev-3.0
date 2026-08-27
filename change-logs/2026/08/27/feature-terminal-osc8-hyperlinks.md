Short: Clickable hyperlinks in the terminal

Markdown links that agents print in the terminal (OSC 8 hyperlinks, e.g. Claude Code's PR/issue references) now underline on hover and open in the browser on Cmd/Ctrl+Click. tmux forwards them via the `hyperlinks` terminal feature, `FORCE_HYPERLINK=1` opts hyperlink-capable CLIs into emitting them, and the renderer recovers each link's URL from the output stream (ghostty-web's wasm never exposes it).
