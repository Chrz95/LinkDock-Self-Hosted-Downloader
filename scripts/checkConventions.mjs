import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

const LONGEST_COMPONENTS_TO_DISPLAY = 5;
const MAXIMUM_LINE_LENGTH = 120;
const MAXIMUM_COMPONENT_LINES = 100;
const SOURCE_DIRECTORIES = ['src', 'server', 'shared', 'tests', 'scripts'];
const SOURCE_EXTENSION = /\.(ts|tsx|mjs|css)$/;
const violations = [];
const componentSizes = [];

/**
 * Walks authored sources without generated output or dependencies.
 * @param {string} directory - Source directory.
 * @returns {string[]} Source paths.
 */
function listSourceFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const filename = path.join(directory, entry.name);
    return entry.isDirectory() ? listSourceFiles(filename) : SOURCE_EXTENSION.test(filename) ? [filename] : [];
  });
}

/**
 * Checks documentation of named functions; trivial inline callbacks are intentionally excluded.
 * @param {ts.Node} node - Candidate AST node.
 * @param {ts.SourceFile} source - Owning source file.
 * @param {string} filename - Diagnostic path.
 */
function checkDocumentation(node, source, filename) {
  const isNamedFunction =
    ts.isFunctionDeclaration(node) ||
    ts.isMethodDeclaration(node) ||
    ts.isConstructorDeclaration(node) ||
    ((ts.isArrowFunction(node) || ts.isFunctionExpression(node)) && ts.isVariableDeclaration(node.parent));
  if (isNamedFunction) {
    const owner = ts.isVariableDeclaration(node.parent) ? node.parent.parent.parent : node;
    const comments = ts.getJSDocCommentsAndTags(owner);
    const documentation = comments.map((comment) => comment.getText(source)).join('\n');
    const line = source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1;
    if (!documentation.includes('/**')) {
      violations.push(`${filename}:${line}: missing function JSDoc`);
    }
    for (const parameter of node.parameters) {
      const name = parameter.name.getText(source);
      if (name.startsWith('{')) {
        continue;
      }
      const hasTypedParameter = documentation.includes(`} ${name}`) || documentation.includes(`} [${name}]`);
      if (!hasTypedParameter) {
        violations.push(`${filename}:${line}: missing typed @param for ${name}`);
      }
    }
  }
  ts.forEachChild(node, (child) => checkDocumentation(child, source, filename));
}

for (const filename of SOURCE_DIRECTORIES.flatMap(listSourceFiles)) {
  const content = readFileSync(filename, 'utf8');
  const lines = content.trimEnd().split('\n');
  lines.forEach((line, index) => {
    if (line.length > MAXIMUM_LINE_LENGTH) {
      violations.push(`${filename}:${index + 1}: exceeds 120 characters`);
    }
  });
  if (filename.endsWith('.tsx') && !filename.includes('.test.')) {
    componentSizes.push({ filename, lines: lines.length });
    if (lines.length > MAXIMUM_COMPONENT_LINES) {
      violations.push(`${filename}: exceeds 100 lines`);
    }
  }
  if (filename.endsWith('.ts') || filename.endsWith('.tsx')) {
    const source = ts.createSourceFile(filename, content, ts.ScriptTarget.Latest, true);
    checkDocumentation(source, source, filename);
  }
}
if (violations.length) {
  process.stderr.write(`${violations.join('\n')}\n`);
  process.exitCode = 1;
} else {
  process.stdout.write('Source line limits and named function documentation: passed.\n');
  componentSizes
    .sort((first, second) => second.lines - first.lines)
    .slice(0, LONGEST_COMPONENTS_TO_DISPLAY)
    .forEach((component) => process.stdout.write(`${component.lines} lines: ${component.filename}\n`));
}
