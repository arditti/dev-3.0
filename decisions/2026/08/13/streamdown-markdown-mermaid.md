# Streamdown owns Markdown and Mermaid rendering

## Context

Markdown previews and PR comments used a custom `marked` plus `sanitize-html` pipeline. Adding Mermaid to that HTML-string pipeline would also require custom lifecycle, loading, error, and theme handling.

## Investigation

Streamdown 2.5 provides GFM and raw HTML parsing, hardened sanitization, React component overrides, and an official `@streamdown/mermaid` plugin. Its sanitizer behaves consistently under the app's happy-dom tests, while source-backed React rendering also removes the old HTML rewriting used for repo-relative images.

## Decision

Use Streamdown for all shared Markdown rendering and its official Mermaid plugin with Mermaid 11.16.1. Dev3 continues to own external-link behavior, repo-relative image reads, theme token mapping, and rich-diff chunking; wide sequence diagrams retain readable SVG dimensions and scroll horizontally instead of shrinking, while `marked` remains only for splitting Markdown diffs into source blocks.

## Risks

The renderer adds bundle weight and depends on Tailwind scanning Streamdown's distributed classes. Security behavior and invalid-diagram fallback are pinned by component tests, and Streamdown's semantic colors are mapped to existing design tokens.

## Alternatives considered

A custom Mermaid hook would duplicate rendering and visibility lifecycle already maintained by Streamdown. Keeping HTML strings and post-processing them would preserve two rendering models and make image and diagram behavior harder to test.
