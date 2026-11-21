import Icon, { type IconName } from '../ui/Icon';
import { formatBytes, formatDateTime } from '../../lib/format';
import type { DriveFile } from '../../types';

const ARCHIVE = /zip|rar|7z|tar|gzip/;

const fileIcon = ({ is_folder, mime_type = '' }: DriveFile): IconName => {
  if (is_folder) return 'folder';
  const kind = mime_type.split('/')[0];
  if (kind === 'video' || kind === 'audio' || kind === 'image') return kind;
  return ARCHIVE.test(mime_type) ? 'archive' : 'file';
};

const fileType = (file: DriveFile) => (file.is_folder ? 'Folder' : (file.mime_type || '').split('/').pop()?.toUpperCase());

function FileName({ file, onOpen }: { file: DriveFile; onOpen: () => void }) {
  const name = <span className="truncate" title={file.name}>{file.name}</span>;
  return file.is_folder ? (
    <button type="button" className="file-cell folder-link" onClick={onOpen}>
      <Icon name="folder" />
      {name}
    </button>
  ) : (
    <span className="file-cell">
      <Icon name={fileIcon(file)} />
      {name}
    </span>
  );
}

export default function DriveFileRow({ file, onOpen }: { file: DriveFile; onOpen: () => void }) {
  const href = file.web_content_link || file.web_view_link;
  return (
    <tr>
      <td className="col-main"><FileName file={file} onOpen={onOpen} /></td>
      <td className="col-type cell-nowrap muted">{fileType(file)}</td>
      <td className="col-size cell-nowrap">{file.is_folder ? '' : formatBytes(file.size)}</td>
      <td className="col-date cell-nowrap muted">{formatDateTime(file.created_time)}</td>
      <td className="cell-end">
        {href ? (
          <a className="btn btn-ghost btn-small" href={href} target="_blank" rel="noopener noreferrer">
            <Icon name={file.is_folder ? 'external' : 'download'} size={14} />
            {file.is_folder ? 'Open in Drive' : 'Download'}
          </a>
        ) : null}
      </td>
    </tr>
  );
}
