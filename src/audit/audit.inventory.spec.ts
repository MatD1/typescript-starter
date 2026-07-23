import { readdirSync, readFileSync, statSync } from 'fs';
import { join, relative } from 'path';
import { AUDITED_MUTATION_INVENTORY } from './audit.inventory';
import { AUDIT_ACTIONS } from './audit.types';

function sourceFiles(root: string): string[] {
  return readdirSync(root).flatMap((name) => {
    const path = join(root, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /(?:controller|resolver)\.ts$/.test(name) ? [path] : [];
  });
}

describe('audited mutation inventory', () => {
  it('forces every REST and GraphQL mutation to be explicitly classified', () => {
    const src = join(process.cwd(), 'src');
    const discovered: string[] = [];
    for (const file of sourceFiles(src)) {
      const rel = relative(src, file).replace(/\\/g, '/');
      const text = readFileSync(file, 'utf8');
      for (const match of text.matchAll(
        /@(Post|Patch|Put|Delete|All)\((?:'([^']*)'|"([^"]*)")?\)/g,
      )) {
        discovered.push(
          `${rel}:${match[1].toUpperCase()}:${match[2] ?? match[3] ?? ''}`,
        );
      }
      for (const match of text.matchAll(
        /@Mutation\([\s\S]*?name:\s*'([^']+)'[\s\S]*?\}\)/g,
      )) {
        discovered.push(`${rel}:GRAPHQL:${match[1]}`);
      }
    }

    expect(discovered.sort()).toEqual(
      Object.keys(AUDITED_MUTATION_INVENTORY).sort(),
    );
  });

  it('only accepts actions from the centralized catalog', () => {
    const actions = new Set(Object.values(AUDIT_ACTIONS));
    expect(
      Object.values(AUDITED_MUTATION_INVENTORY).every((action) =>
        actions.has(action),
      ),
    ).toBe(true);
  });
});
