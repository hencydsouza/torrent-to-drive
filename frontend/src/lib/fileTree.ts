import type { FileInfo } from '../types';

export interface TreeNode {
  name: string;
  path: string;
  children: Map<string, TreeNode>;
  files: FileInfo[];
}

const node = (name: string, path: string): TreeNode => ({ name, path, children: new Map(), files: [] });

// Flat file list -> nested folder tree.
export function buildFileTree(files: FileInfo[]): TreeNode {
  const root = node('', '');
  for (const file of files) {
    let current = root;
    for (const part of file.path.split('/').slice(0, -1)) {
      let child = current.children.get(part);
      if (!child) {
        child = node(part, `${current.path}${part}/`);
        current.children.set(part, child);
      }
      current = child;
    }
    current.files.push(file);
  }
  return root;
}
