export function splitArgs(input: string): string[] {
  const args: string[] = [];
  let current = "";
  let quote: '"' | "'" | undefined;
  let escaping = false;
  let inToken = false;

  function pushCurrent(): void {
    if (inToken || current.length > 0) {
      args.push(current);
      current = "";
      inToken = false;
    }
  }

  for (const char of input) {
    if (escaping) {
      current += char;
      escaping = false;
      inToken = true;
    } else if (char === "\\") {
      escaping = true;
      inToken = true;
    } else if (quote) {
      if (char === quote) {
        quote = undefined;
        inToken = true;
      } else {
        current += char;
        inToken = true;
      }
    } else if (char === '"' || char === "'") {
      quote = char;
      inToken = true;
    } else if (/\s/.test(char)) {
      pushCurrent();
    } else {
      current += char;
      inToken = true;
    }
  }

  if (escaping) {
    current += "\\";
    inToken = true;
  }
  pushCurrent();
  return args;
}
