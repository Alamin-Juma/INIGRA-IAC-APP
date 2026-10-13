import { readFileSync, writeFileSync } from "node:fs";
import { stdin as input, stdout as output } from "node:process";
import { parseInput } from "./types.js";
import { generateMainTf } from "./mainTf.js";

async function readJsonPayload(pathArg?: string): Promise<string> {
  if (pathArg) {
    return readFileSync(pathArg, "utf8");
  }

  if (input.isTTY) {
    throw new Error("Provide input JSON file path or pipe JSON on stdin");
  }

  return new Promise((resolve, reject) => {
    let data = "";
    input.setEncoding("utf8");
    input.on("data", (chunk) => {
      data += chunk;
    });
    input.on("end", () => resolve(data));
    input.on("error", reject);
  });
}

async function main(): Promise<void> {
  const raw = await readJsonPayload(process.argv[2]);
  const parsed = parseInput(JSON.parse(raw));
  const tf = generateMainTf(parsed);
  writeFileSync("main.tf", tf, "utf8");
  output.write("Generated main.tf\n");
}

main().catch((err) => {
  console.error(String(err?.message || err));
  process.exit(1);
});
