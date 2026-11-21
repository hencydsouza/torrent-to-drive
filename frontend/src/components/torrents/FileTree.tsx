import { useState } from 'react';
import Icon from '../ui/Icon';
import { formatBytes } from '../../lib/format';
import type { TreeNode } from '../../lib/fileTree';

interface FileTreeProps {
  node: TreeNode;
  selected: Set<number>;
  onToggle: (index: number) => void;
  depth?: number;
}
export default function FileTree({ node, selected, onToggle, depth = 0 }: FileTreeProps) {
  const [expanded, setExpanded] = useState(depth === 0);
  const indent = { '--depth': depth };

  return (
    <div className="tree-node">
      {depth > 0 && (
        <button type="button" className="tree-folder" style={indent} onClick={() => setExpanded(!expanded)} aria-expanded={expanded}>
          <Icon name={expanded ? 'folderOpen' : 'folder'} />
          <span className="truncate">{node.name}</span>
        </button>
      )}
      {expanded && (
        <>
          {[...node.children.values()].map((child) => (
            <FileTree key={child.path} node={child} selected={selected} onToggle={onToggle} depth={depth + 1} />
          ))}
          {node.files.map((file) => (
            <label key={file.index} className="tree-file" style={{ '--depth': depth + 1 }}>
              <input type="checkbox" checked={selected.has(file.index)} onChange={() => onToggle(file.index)} />
              <Icon name="file" />
              <span className="tree-file-name">{file.path.split('/').pop()}</span>
              <span className="tree-file-size num">{formatBytes(file.size)}</span>
            </label>
          ))}
        </>
      )}
    </div>
  );
}
