export interface ChatDiffLine {
  type: "context" | "add" | "remove";
  oldLineNumber: number | null;
  newLineNumber: number | null;
  content: string;
}

export interface ChatDiffResult {
  lines: ChatDiffLine[];
  additions: number;
  deletions: number;
}

type DiffOp =
  | { type: "context"; content: string }
  | { type: "add"; content: string }
  | { type: "remove"; content: string };

function splitLines(content: string): string[] {
  return content.replace(/\r\n/g, "\n").split("\n");
}

function backtrackDiff(before: string[], after: string[]): DiffOp[] {
  const rows = before.length;
  const cols = after.length;
  const table: number[][] = Array.from({ length: rows + 1 }, () =>
    Array(cols + 1).fill(0),
  );

  for (let row = 1; row <= rows; row += 1) {
    for (let col = 1; col <= cols; col += 1) {
      if (before[row - 1] === after[col - 1]) {
        table[row][col] = table[row - 1][col - 1] + 1;
      } else {
        table[row][col] = Math.max(table[row - 1][col], table[row][col - 1]);
      }
    }
  }

  const ops: DiffOp[] = [];
  let row = rows;
  let col = cols;

  while (row > 0 && col > 0) {
    if (before[row - 1] === after[col - 1]) {
      ops.push({ type: "context", content: before[row - 1] });
      row -= 1;
      col -= 1;
      continue;
    }

    if (table[row - 1][col] >= table[row][col - 1]) {
      ops.push({ type: "remove", content: before[row - 1] });
      row -= 1;
    } else {
      ops.push({ type: "add", content: after[col - 1] });
      col -= 1;
    }
  }

  while (row > 0) {
    ops.push({ type: "remove", content: before[row - 1] });
    row -= 1;
  }

  while (col > 0) {
    ops.push({ type: "add", content: after[col - 1] });
    col -= 1;
  }

  return ops.reverse();
}

export function buildChatDiff(
  originalContent: string,
  updatedContent: string,
): ChatDiffResult {
  const ops = backtrackDiff(splitLines(originalContent), splitLines(updatedContent));
  const lines: ChatDiffLine[] = [];
  let oldLineNumber = 1;
  let newLineNumber = 1;
  let additions = 0;
  let deletions = 0;

  for (const op of ops) {
    if (op.type === "context") {
      lines.push({
        type: "context",
        oldLineNumber,
        newLineNumber,
        content: op.content,
      });
      oldLineNumber += 1;
      newLineNumber += 1;
      continue;
    }

    if (op.type === "remove") {
      deletions += 1;
      lines.push({
        type: "remove",
        oldLineNumber,
        newLineNumber: null,
        content: op.content,
      });
      oldLineNumber += 1;
      continue;
    }

    additions += 1;
    lines.push({
      type: "add",
      oldLineNumber: null,
      newLineNumber,
      content: op.content,
    });
    newLineNumber += 1;
  }

  return { lines, additions, deletions };
}
