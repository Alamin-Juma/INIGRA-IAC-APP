export function joinBlocks(blocks: string[]): string {
  return blocks.filter(Boolean).join("\n\n").trimEnd() + "\n";
}

export function indent(text: string, spaces = 2): string {
  const pad = " ".repeat(spaces);
  return text
    .split("\n")
    .map((line) => (line.length ? `${pad}${line}` : line))
    .join("\n");
}
