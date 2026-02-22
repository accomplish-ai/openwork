const fs = require('fs');
const path = require('path');

const TARGET_DIRS = ['apps/desktop/src', 'packages/agent-core/src'];

function cleanFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  let newContent = content;

  // Regex to find console.log calls
  // 1. Simple single-line logs: console.log(...);
  // We replace them with // console.log(...);
  // We avoid lines that already start with //

  // This regex matches "console.log" at the start of a logical line (ignoring whitespace)
  // and captures until the next ; or line end.
  // Note: Handling all edge cases with regex is hard. Use conservative replacement.

  // Strategy:
  // Replace `console.log(` with `// console.log(` IF it's likely a debug log.
  // We want to skip `console.log = ...` (overrides)

  const regex = /^\s*console\.log\(/gm;

  // We will process line by line to be safer regarding AST context
  const lines = content.split('\n');
  const processedLines = lines.map((line) => {
    // 1. Check if line has console.log
    if (line.includes('console.log(')) {
      // 2. Check if it's already commented
      if (line.trim().startsWith('//') || line.trim().startsWith('*')) {
        return line;
      }

      // 3. Check if it is an assignment (e.g. console.log = ...) -> The search string 'console.log(' avoids this mostly,
      // strictly checking for function call usage.

      // 4. Comment it out
      // We put // at the start of the trimmed line to preserve indentation?
      // No, let's just put // at the very start of the content, but that might mess up indentation visual.
      // Better: replace `console.log` with `// console.log`? No, that comments the rest of line.
      // If the line has code BEFORE console.log, it might break.
      // e.g. `if (x) console.log(x);` -> `if (x) // console.log(x);` which comments out the logic? No, JS parsing handles that usually ok,
      // but `if (x) console.log(x); else ...` -> `if (x) // ...; else` BROKEN (else becomes part of comment or detached).

      // SAFE BET: Only comment out lines that START with console.log (after whitespace)
      if (line.trim().startsWith('console.log(')) {
        return line.replace('console.log(', '// console.log(');
      }
    }
    return line;
  });

  newContent = processedLines.join('\n');

  if (newContent !== content) {
    console.log(`[PATCHED] ${filePath}`);
    fs.writeFileSync(filePath, processedLines.join('\n'), 'utf8');
  }
}

function walkDir(dir) {
  if (!fs.existsSync(dir)) return;

  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);

    if (stat.isDirectory()) {
      if (file !== 'node_modules') {
        walkDir(fullPath);
      }
    } else if (file.endsWith('.ts') || file.endsWith('.tsx') || file.endsWith('.js')) {
      cleanFile(fullPath);
    }
  }
}

TARGET_DIRS.forEach((dir) => {
  console.log(`Cleaning ${dir}...`);
  walkDir(path.resolve(__dirname, dir));
});
