const fs = require('fs');

const text = fs.readFileSync('eslint-errors.txt', 'utf8');
const lines = text.split(/\r?\n/);

let currentFile = null;
let fileModifications = {};

for (const line of lines) {
  if (line.startsWith('D:\\')) {
    currentFile = line.trim();
    if (!fileModifications[currentFile]) {
      fileModifications[currentFile] = [];
    }
  } else if (currentFile && line.includes('react/no-unescaped-entities')) {
    const match = line.match(/^\s*(\d+):(\d+)/);
    if (match) {
      const lineNum = parseInt(match[1], 10) - 1;
      const colNum = parseInt(match[2], 10) - 1;
      const isSingle = line.includes('`\'`');
      fileModifications[currentFile].push({ lineNum, colNum, isSingle });
    }
  }
}

for (const [file, mods] of Object.entries(fileModifications)) {
  if (mods.length === 0) continue;
  let content = fs.readFileSync(file, 'utf8');
  let linesArr = content.split(/\r?\n/);
  
  // Sort mods by lineNum, then by colNum DESCENDING so replacements on the same line don't mess up indices
  mods.sort((a, b) => {
    if (a.lineNum !== b.lineNum) return b.lineNum - a.lineNum;
    return b.colNum - a.colNum;
  });
  
  for (const mod of mods) {
    let targetLine = linesArr[mod.lineNum];
    if (mod.isSingle) {
      targetLine = targetLine.substring(0, mod.colNum) + '&apos;' + targetLine.substring(mod.colNum + 1);
    } else {
      targetLine = targetLine.substring(0, mod.colNum) + '&quot;' + targetLine.substring(mod.colNum + 1);
    }
    linesArr[mod.lineNum] = targetLine;
  }
  
  fs.writeFileSync(file, linesArr.join('\n'));
}

console.log("Fixed quotes!");
