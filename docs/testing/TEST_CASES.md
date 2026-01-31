# AIS Code - Manual Test Cases

## Chat basics
- Send a short greeting ("hi") and verify a response arrives within 2 seconds.
- Send "what is this project?" and confirm a direct answer (no tool calls).
- Send a question in a non-English language and confirm status text localizes.

## Tool timeline + timeouts
- Trigger a tool call (read a file). Verify a tool card appears immediately.
- Simulate a stuck tool (disconnect or kill tool executor). Verify timeout marks it failed.
- Verify tool results attach to the correct tool call in the timeline.

## Context behavior
- Open 2 files, ask "remove unused imports". Ensure open tabs are used in context.
- Ask about a file by name without @ and verify the warning is suppressed.
- Change a tracked file externally and verify stale-context warning shows.

## Auto-approval
- Enable auto-approve and run an edit. Confirm no approval modal appears.
- Disable auto-approve and verify edit request requires confirmation.

## Scroll behavior
- While streaming, scroll up and confirm the view does not force-scroll down.
- Scroll to bottom and confirm auto-scroll resumes.
