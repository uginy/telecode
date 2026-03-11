import * as path from "node:path";
import * as vscode from "vscode";

export class DevWatchController {
	private autoReloadTimer: NodeJS.Timeout | null = null;
	private uiRefreshTimer: NodeJS.Timeout | null = null;
	private isReloadInProgress = false;
	private devReloadArmedAt = 0;

	public dispose(): void {
		if (this.autoReloadTimer) {
			clearTimeout(this.autoReloadTimer);
			this.autoReloadTimer = null;
		}
		if (this.uiRefreshTimer) {
			clearTimeout(this.uiRefreshTimer);
			this.uiRefreshTimer = null;
		}
	}

	public setup(
		context: vscode.ExtensionContext,
		options: {
			onUiRefreshed: (changedFile: string) => void;
			onPromptChanged: (changedFile: string) => void;
		},
	): void {
		this.setupDevAutoReload(context, options.onUiRefreshed);
		this.setupPromptStackWatcher(context, options.onPromptChanged);
	}

	private setupDevAutoReload(
		context: vscode.ExtensionContext,
		onUiRefreshed: (changedFile: string) => void,
	): void {
		if (context.extensionMode !== vscode.ExtensionMode.Development) {
			return;
		}

		const config = vscode.workspace.getConfiguration("telecode");
		const enabled = config.get<boolean>("dev.autoReloadWindow", true);
		if (!enabled) {
			return;
		}

		const extRoot = context.extensionUri;
		const watcher = vscode.workspace.createFileSystemWatcher(
			new vscode.RelativePattern(extRoot, "dist/extension.js"),
		);
		const onBundled = () => this.scheduleDevReload();
		this.devReloadArmedAt = Date.now() + 1_500;

		watcher.onDidChange(onBundled);
		watcher.onDidCreate(onBundled);
		context.subscriptions.push(watcher);

		const uiWatcher = vscode.workspace.createFileSystemWatcher(
			new vscode.RelativePattern(extRoot, "media/*.{css,js,html}"),
		);
		const onUiChanged = (uri: vscode.Uri) => {
			this.scheduleUiRefresh(path.basename(uri.fsPath), onUiRefreshed);
		};
		uiWatcher.onDidCreate(onUiChanged);
		uiWatcher.onDidChange(onUiChanged);
		uiWatcher.onDidDelete(onUiChanged);
		context.subscriptions.push(uiWatcher);
	}

	private setupPromptStackWatcher(
		context: vscode.ExtensionContext,
		onPromptChanged: (changedFile: string) => void,
	): void {
		const watcher = vscode.workspace.createFileSystemWatcher("**/prompts/*.md");
		const handleChange = (uri: vscode.Uri) => {
			onPromptChanged(path.basename(uri.fsPath));
		};

		watcher.onDidCreate(handleChange);
		watcher.onDidChange(handleChange);
		watcher.onDidDelete(handleChange);
		context.subscriptions.push(watcher);
	}

	private scheduleDevReload(): void {
		if (Date.now() < this.devReloadArmedAt) {
			return;
		}

		if (this.isReloadInProgress) {
			return;
		}

		if (this.autoReloadTimer) {
			clearTimeout(this.autoReloadTimer);
		}

		this.autoReloadTimer = setTimeout(() => {
			this.autoReloadTimer = null;
			this.isReloadInProgress = true;
			void vscode.commands.executeCommand("workbench.action.reloadWindow").then(
				() => {
					setTimeout(() => {
						this.isReloadInProgress = false;
					}, 5_000);
				},
				() => {
					this.isReloadInProgress = false;
				},
			);
		}, 450);
	}

	private scheduleUiRefresh(
		changedFile: string,
		onUiRefreshed: (changedFile: string) => void,
	): void {
		if (this.uiRefreshTimer) {
			clearTimeout(this.uiRefreshTimer);
		}

		this.uiRefreshTimer = setTimeout(() => {
			this.uiRefreshTimer = null;
			onUiRefreshed(changedFile);
		}, 150);
	}
}
