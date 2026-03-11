import * as vscode from "vscode";
import type { ChatViewProvider } from "../ui/chatViewProvider";
import {
	buildTaskDiff,
	collectTaskReviewSummary,
	commitTaskFiles,
	loadTaskReviewSummary,
	revertTaskFiles,
	runWorkspaceChecks,
	saveTaskReviewSummary,
	type TaskOutcome,
	type TaskReviewSummary,
} from "./taskReview";

export class TaskReviewController {
	private latestResult: TaskReviewSummary | null = null;

	constructor(
		private readonly workspaceRoot: string,
		private readonly getChatView: () => Pick<
			ChatViewProvider,
			"appendOutput" | "notify" | "setTaskResult"
		> | null,
		private readonly appendLogLine: (line: string) => void,
	) {}

	public async loadPersisted(): Promise<void> {
		this.latestResult = await loadTaskReviewSummary(this.workspaceRoot);
		this.syncToView();
	}

	public async captureRunResult(options: {
		prompt: string;
		outcome: TaskOutcome;
		error?: string;
	}): Promise<void> {
		const checks = this.latestResult?.prompt === options.prompt
			? this.latestResult.checks
			: [];
		this.latestResult = await collectTaskReviewSummary({
			workspaceRoot: this.workspaceRoot,
			prompt: options.prompt,
			outcome: options.outcome,
			error: options.error,
			checks,
		});
		await saveTaskReviewSummary(this.workspaceRoot, this.latestResult);
		this.syncToView();
		this.appendLogLine(`[review] ${this.latestResult.summary}`);
	}

	public getLatestResult(): TaskReviewSummary | null {
		return this.latestResult;
	}

	public async runChecks(): Promise<void> {
		if (!this.latestResult) {
			this.notifyUser("No completed task to check yet.");
			return;
		}

		this.appendLogLine("[review] Running workspace checks...");
		const checks = await runWorkspaceChecks(this.workspaceRoot);
		this.latestResult = await collectTaskReviewSummary({
			workspaceRoot: this.workspaceRoot,
			prompt: this.latestResult.prompt,
			outcome: this.latestResult.outcome,
			error: this.latestResult.error,
			checks,
		});
		await saveTaskReviewSummary(this.workspaceRoot, this.latestResult);
		this.syncToView();
		this.appendLogLine(`[review] Checks: ${this.latestResult.summary}`);
		this.notifyUser(`Checks finished: ${this.latestResult.summary}`);
	}

	public async showDiff(): Promise<void> {
		if (!this.latestResult) {
			this.notifyUser("No task result to diff yet.");
			return;
		}

		const diff = await buildTaskDiff(
			this.workspaceRoot,
			this.latestResult.changedFiles,
		);
		const chatView = this.getChatView();
		if (chatView) {
			chatView.appendOutput(`\n[review:diff]\n${diff}\n`);
			chatView.notify("Diff appended to logs.");
			return;
		}

		const document = await vscode.workspace.openTextDocument({
			content: diff,
			language: "diff",
		});
		await vscode.window.showTextDocument(document, { preview: false });
	}

	public async commitLatest(): Promise<void> {
		if (!this.latestResult || !this.latestResult.canCommit) {
			this.notifyUser("No changed files to commit.");
			return;
		}

		const message = await vscode.window.showInputBox({
			prompt: "Commit message",
			placeHolder: "chore: review approved changes",
			ignoreFocusOut: true,
		});
		if (!message?.trim()) {
			return;
		}

		const result = await commitTaskFiles({
			workspaceRoot: this.workspaceRoot,
			files: this.latestResult.changedFiles,
			message: message.trim(),
		});
		if (!result.ok) {
			this.appendLogLine(`[review:error] ${result.message}`);
			vscode.window.showErrorMessage(`TeleCode AI: ${result.message}`);
			return;
		}

		this.appendLogLine(`[review] ${result.message}`);
		await this.captureRunResult({
			prompt: this.latestResult.prompt,
			outcome: this.latestResult.outcome,
			error: this.latestResult.error,
		});
		this.notifyUser(result.message);
	}

	public async revertLatest(): Promise<void> {
		if (!this.latestResult || this.latestResult.changedFiles.length === 0) {
			this.notifyUser("No touched files to revert.");
			return;
		}

		const confirmed = await vscode.window.showWarningMessage(
			"Revert touched files from the last task?",
			{ modal: true },
			"Revert",
		);
		if (confirmed !== "Revert") {
			return;
		}

		const result = await revertTaskFiles({
			workspaceRoot: this.workspaceRoot,
			files: this.latestResult.changedFiles,
		});
		if (!result.ok) {
			this.appendLogLine(`[review:error] ${result.message}`);
			vscode.window.showErrorMessage(`TeleCode AI: ${result.message}`);
			return;
		}

		this.appendLogLine(`[review] ${result.message}`);
		await this.captureRunResult({
			prompt: this.latestResult.prompt,
			outcome: this.latestResult.outcome,
			error: this.latestResult.error,
		});
		this.notifyUser(result.message);
	}

	private syncToView(): void {
		this.getChatView()?.setTaskResult(this.latestResult);
	}

	private notifyUser(message: string): void {
		const chatView = this.getChatView();
		if (chatView) {
			chatView.notify(message);
			return;
		}
		void vscode.window.showInformationMessage(`TeleCode AI: ${message}`);
	}
}
