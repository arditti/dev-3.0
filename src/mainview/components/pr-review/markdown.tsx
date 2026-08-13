import { useMemo, type ComponentProps } from "react";
import { createMermaidPlugin } from "@streamdown/mermaid";
import type { MermaidConfig } from "mermaid";
import remarkBreaks from "remark-breaks";
import {
	Streamdown,
	defaultRemarkPlugins,
	type Components,
	type MermaidErrorComponentProps,
} from "streamdown";
import { useResolvedTheme } from "../../hooks/useResolvedTheme";
import {
	isDiskImageSrc,
	MarkdownImage,
	MarkdownImageProvider,
	protectDiskImageSrc,
} from "./markdown-images";

const mermaidPlugin = createMermaidPlugin();
const plugins = { mermaid: mermaidPlugin };
const RELATIVE_LINK_URL_PREFIX = "https://dev3.invalid/__markdown_link__/";

interface MarkdownTreeNode {
	type?: string;
	url?: string;
	identifier?: string;
	children?: MarkdownTreeNode[];
}

function remarkProtectDiskImages() {
	return (tree: MarkdownTreeNode) => {
		const imageReferences = new Set<string>();
		const linkReferences = new Set<string>();
		const definitions: MarkdownTreeNode[] = [];
		const nodes: MarkdownTreeNode[] = [tree];
		for (let index = 0; index < nodes.length; index++) {
			const node = nodes[index];
			if (node.type === "imageReference" && node.identifier) {
				imageReferences.add(node.identifier.toLowerCase());
			}
			if (node.type === "linkReference" && node.identifier) {
				linkReferences.add(node.identifier.toLowerCase());
			}
			if (node.type === "image" && node.url && isDiskImageSrc(node.url)) {
				node.url = protectDiskImageSrc(node.url);
			}
			if (node.type === "link" && node.url && !node.url.startsWith("#") && isDiskImageSrc(node.url)) {
				node.url = protectRelativeLink(node.url);
			}
			if (node.type === "definition") definitions.push(node);
			if (node.children) nodes.push(...node.children);
		}
		for (const definition of definitions) {
			if (!definition.identifier || !definition.url || !isDiskImageSrc(definition.url)) continue;
			const identifier = definition.identifier.toLowerCase();
			if (imageReferences.has(identifier)) {
				definition.url = protectDiskImageSrc(definition.url);
			} else if (linkReferences.has(identifier) && !definition.url.startsWith("#")) {
				definition.url = protectRelativeLink(definition.url);
			}
		}
	};
}

const markdownRemarkPlugins = [...Object.values(defaultRemarkPlugins), remarkProtectDiskImages];
const commentRemarkPlugins = [...markdownRemarkPlugins, remarkBreaks];
const allowedTags = {
	details: [],
	summary: [],
	ins: [],
	input: ["type", "checked", "disabled"],
};

function tokenColor(token: string): string | undefined {
	const value = getComputedStyle(document.documentElement).getPropertyValue(token).trim();
	if (!value) return undefined;

	const channels = value.split(/\s+/);
	if (channels.length === 3 && channels.every((channel) => /^\d+(?:\.\d+)?%?$/.test(channel))) {
		return `rgb(${channels.join(", ")})`;
	}
	return value;
}

function createMermaidConfig(): MermaidConfig {
	const tokens: Record<string, string> = {
		background: "--surface-base",
		primaryColor: "--surface-elevated",
		primaryTextColor: "--text-primary",
		primaryBorderColor: "--border-active",
		secondaryColor: "--surface-raised",
		secondaryTextColor: "--text-primary",
		secondaryBorderColor: "--border-default",
		tertiaryColor: "--surface-overlay",
		tertiaryTextColor: "--text-primary",
		tertiaryBorderColor: "--border-active",
		lineColor: "--text-tertiary",
		textColor: "--text-primary",
		mainBkg: "--surface-elevated",
		nodeBorder: "--border-active",
		clusterBkg: "--surface-raised",
		clusterBorder: "--border-default",
		edgeLabelBackground: "--surface-base",
		titleColor: "--text-primary",
	};
	const themeVariables = Object.fromEntries(
		Object.entries(tokens).flatMap(([name, token]) => {
			const color = tokenColor(token);
			return color ? [[name, color]] : [];
		}),
	);

	return {
		startOnLoad: false,
		securityLevel: "strict",
		suppressErrorRendering: true,
		theme: "base",
		look: "neo",
		htmlLabels: true,
		fontFamily: getComputedStyle(document.body).fontFamily || undefined,
		sequence: {
			useMaxWidth: false,
			wrap: true,
		},
		themeVariables,
	};
}

interface MarkdownRendererConfig {
	mermaid: MermaidConfig;
	theme: "dark" | "light";
}

export function useMarkdownRendererConfig(): MarkdownRendererConfig {
	const theme = useResolvedTheme();
	const mermaid = useMemo(createMermaidConfig, [theme]);
	return useMemo(() => ({ mermaid, theme }), [mermaid, theme]);
}

function MermaidSourceFallback({ chart }: MermaidErrorComponentProps) {
	return (
		<pre data-mermaid-state="error">
			<code className="language-mermaid">{chart}</code>
		</pre>
	);
}

function protectRelativeLink(href: string): string {
	return `${RELATIVE_LINK_URL_PREFIX}${encodeURIComponent(href)}`;
}

function unprotectRelativeLink(href: string | undefined): string | undefined {
	if (!href?.startsWith(RELATIVE_LINK_URL_PREFIX)) return href;
	try {
		return decodeURIComponent(href.slice(RELATIVE_LINK_URL_PREFIX.length));
	} catch {
		return undefined;
	}
}

function ExternalMarkdownLink({ children, href, ...props }: ComponentProps<"a">) {
	return (
		<a {...props} href={unprotectRelativeLink(href)} target="_blank" rel="noopener noreferrer">
			{children}
		</a>
	);
}

interface MarkdownContentProps {
	body: string;
	document?: boolean;
	imageBaseDir?: string | null;
	imageRootDir?: string | null;
	rendererConfig: MarkdownRendererConfig;
}

export function MarkdownContent({
	body,
	document: isDocument = false,
	imageBaseDir,
	imageRootDir,
	rendererConfig,
}: MarkdownContentProps) {
	const components = useMemo<Components>(() => ({
		a: ({ node: _node, ...props }) => <ExternalMarkdownLink {...props} />,
		img: ({ node: _node, ...props }) => (
			<MarkdownImage
				{...props}
				imageBaseDir={imageBaseDir}
				imageRootDir={imageRootDir}
			/>
		),
		input: ({ node: _node, ...props }) => <input {...props} disabled />,
		strong: ({ node: _node, ...props }) => <strong {...props} />,
	}), [imageBaseDir, imageRootDir]);

	return (
		<Streamdown
			key={`${rendererConfig.theme}:${isDocument}:${imageBaseDir ?? ""}:${imageRootDir ?? ""}`}
			mode="static"
			dir="auto"
			className={`space-y-0${isDocument ? " dev3-md-doc" : ""}`}
			components={components}
			controls={false}
			lineNumbers={false}
			linkSafety={{ enabled: false }}
			allowedTags={allowedTags}
			plugins={plugins}
			mermaid={{ config: rendererConfig.mermaid, errorComponent: MermaidSourceFallback }}
			remarkPlugins={isDocument ? markdownRemarkPlugins : commentRemarkPlugins}
		>
			{body}
		</Streamdown>
	);
}

export function MarkdownDocument({ body, className, imageBaseDir, imageRootDir }: {
	body: string;
	className?: string;
	/** Directory of the document, so repo-relative images can be read off disk. */
	imageBaseDir?: string | null;
	/** Checkout root, for root-relative image paths (`/docs/shot.png`). */
	imageRootDir?: string | null;
}) {
	const rendererConfig = useMarkdownRendererConfig();
	return (
		<div
			className={`dev3-pr-md min-w-0 text-sm leading-relaxed text-fg${className ? ` ${className}` : ""}`}
			data-testid="markdown-document"
		>
			<MarkdownImageProvider resetKey={body}>
				<MarkdownContent
					body={body}
					document
					imageBaseDir={imageBaseDir}
					imageRootDir={imageRootDir}
					rendererConfig={rendererConfig}
				/>
			</MarkdownImageProvider>
		</div>
	);
}

export function CommentMarkdown({ body }: { body: string }) {
	const rendererConfig = useMarkdownRendererConfig();
	return (
		<div
			className="dev3-pr-md min-w-0 text-sm leading-relaxed text-fg"
			data-testid="pr-comment-markdown"
		>
			<MarkdownContent body={body} rendererConfig={rendererConfig} />
		</div>
	);
}
