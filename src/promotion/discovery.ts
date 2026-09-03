export async function unpromotedAcceptedLines(
  accepted: Array<{ repo: string; line: string }>,
  isPending: (row: { repo: string; line: string }) => Promise<boolean>,
): Promise<Array<{ repo: string; line: string }>> {
  const pending: Array<{ repo: string; line: string }> = [];
  for (const row of accepted) if (await isPending(row)) pending.push(row);
  return pending;
}
