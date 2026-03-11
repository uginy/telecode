import { cmd } from './commands';
import { el } from './ui-state';
import type { TaskReviewSummary } from '../extension/taskReview';

function formatCheckList(result: TaskReviewSummary): string {
  if (result.checks.length === 0) {
    return 'Checks: not run';
  }
  return result.checks
    .map((check) => `${check.label}: ${check.status}${check.summary ? ` (${check.summary})` : ''}`)
    .join(' • ');
}

function formatFiles(result: TaskReviewSummary): string {
  if (result.changedFiles.length === 0) {
    return 'No changed files';
  }
  return result.changedFiles
    .slice(0, 6)
    .map((file) => `${file.status}: ${file.path}`)
    .join('\n');
}

export function bindTaskResultActions(): void {
  el.taskDiffBtn()?.addEventListener('click', () => cmd.showTaskDiff());
  el.taskChecksBtn()?.addEventListener('click', () => cmd.runTaskChecks());
  el.taskCommitBtn()?.addEventListener('click', () => cmd.commitTaskChanges());
  el.taskRevertBtn()?.addEventListener('click', () => cmd.revertTaskChanges());
}

export function renderTaskResultCard(result: TaskReviewSummary | null): void {
  const card = el.taskResultCard();
  if (!card) {
    return;
  }

  if (!result) {
    card.classList.add('hidden');
    return;
  }

  card.classList.remove('hidden');
  el.taskResultTitle().textContent =
    result.outcome === 'completed'
      ? 'Last task completed'
      : result.outcome === 'failed'
        ? 'Last task failed'
        : 'Last task interrupted';
  el.taskResultSummary().textContent = result.summary;
  el.taskResultMeta().textContent = [
    result.branch ? `branch: ${result.branch}` : 'branch: -',
    `at: ${new Date(result.completedAt).toLocaleString()}`,
  ].join(' • ');
  el.taskResultPrompt().textContent = result.prompt;
  el.taskResultFiles().textContent = formatFiles(result);
  el.taskResultChecks().textContent = formatCheckList(result);

  el.taskDiffBtn().disabled = result.changedFiles.length === 0;
  el.taskChecksBtn().disabled = false;
  el.taskCommitBtn().disabled = !result.canCommit;
  el.taskRevertBtn().disabled = result.changedFiles.length === 0;
}
