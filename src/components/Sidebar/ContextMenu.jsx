import { useState } from 'react';
import useNotesStore from '../../store/notesStore';
import useUIStore from '../../store/uiStore';
import ConfirmDialog from '../ConfirmDialog';

// Count all descendant notes inside a folder recursively
const getDescendantCount = (folderId) => {
    const { getChildren } = useNotesStore.getState();
    let noteCount = 0;
    let folderCount = 0;
    const countRecursive = (parentId) => {
        const children = getChildren(parentId);
        children.forEach(child => {
            if (child.type === 'note') noteCount++;
            if (child.type === 'folder') {
                folderCount++;
                countRecursive(child.id);
            }
        });
    };
    countRecursive(folderId);
    return { noteCount, folderCount };
};

const ContextMenu = ({ x, y, item, onClose, onRename, onShowTemplate }) => {
    const { createFolder, deleteItem, undoLastDelete, togglePinNote, isPinned } = useNotesStore();
    const { addNotification } = useUIStore();
    const isNotePinned = item.type === 'note' && isPinned(item.id);
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

    const handleAction = async (action) => {
        try {
            if (action === 'newNote') {
                onShowTemplate(item.type === 'folder' ? item.id : item.parentId);
                onClose();
                return;
            } else if (action === 'newFolder') {
                await createFolder(item.type === 'folder' ? item.id : item.parentId);
            } else if (action === 'rename') {
                onRename(item);
                return;
            } else if (action === 'pin') {
                togglePinNote(item.id);
                onClose();
                return;
            } else if (action === 'delete') {
                setShowDeleteConfirm(true);
                return; // Don't close menu yet, wait for confirmation
            }
        } catch (error) {
            console.error('Context menu action failed:', error);
            addNotification('Action failed: ' + error.message, 'error');
        } finally {
            if (action !== 'delete') {
                onClose();
            }
        }
    };

    const handleConfirmDelete = async () => {
        try {
            const hasFilePath = !!item.filePath;
            await deleteItem(item.id);

            if (hasFilePath) {
                addNotification(
                    `${item.type === 'note' ? 'Note' : 'Folder'} deleted`,
                    'success',
                    5000,
                    {
                        label: 'Undo',
                        callback: async () => {
                            const restored = await undoLastDelete();
                            if (restored) {
                                addNotification('Delete undone', 'success');
                            } else {
                                addNotification('Failed to undo delete', 'error');
                            }
                        }
                    }
                );
            } else {
                addNotification(`${item.type === 'note' ? 'Note' : 'Folder'} deleted`, 'success');
            }
        } catch (error) {
            console.error('Delete failed:', error);
            addNotification('Delete failed: ' + error.message, 'error');
        } finally {
            setShowDeleteConfirm(false);
            onClose();
        }
    };

    const handleCancelDelete = () => {
        setShowDeleteConfirm(false);
        onClose();
    };

    return (
        <>
            <div
                className="fixed inset-0 z-40"
                onClick={onClose}
            />
            <div
                className="fixed z-50 glass-panel rounded-lg shadow-2xl py-1 min-w-[180px] animate-in fade-in zoom-in-95 duration-100"
                style={{ left: x, top: y }}
            >
                {(item.type === 'folder' || item.type === 'note') && (
                    <>
                        <button
                            className="w-full px-3 py-2 text-left text-sm text-text-primary hover:bg-overlay-light flex items-center gap-2 transition-colors"
                            onClick={() => handleAction('newNote')}
                        >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                            </svg>
                            New Note
                        </button>
                        <button
                            className="w-full px-3 py-2 text-left text-sm text-text-primary hover:bg-overlay-light flex items-center gap-2 transition-colors"
                            onClick={() => handleAction('newFolder')}
                        >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 13h6m-3-3v6m-9 1V7a2 2 0 012-2h6l2 2h6a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
                            </svg>
                            New Folder
                        </button>
                        <div className="my-1 border-t border-glass-border" />
                        <button
                            className="w-full px-3 py-2 text-left text-sm text-text-primary hover:bg-overlay-light flex items-center gap-2 transition-colors"
                            onClick={() => handleAction('rename')}
                        >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                            </svg>
                            Rename
                        </button>
                        {item.type === 'note' && (
                            <button
                                className="w-full px-3 py-2 text-left text-sm text-text-primary hover:bg-overlay-light flex items-center gap-2 transition-colors"
                                onClick={() => handleAction('pin')}
                            >
                                <svg className={`w-4 h-4 ${isNotePinned ? 'text-amber-400 fill-amber-400' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
                                </svg>
                                {isNotePinned ? 'Unpin' : 'Pin to top'}
                            </button>
                        )}
                        <div className="my-1 border-t border-glass-border" />
                        <button
                            className="w-full px-3 py-2 text-left text-sm text-red-400 hover:bg-red-500/10 flex items-center gap-2 transition-colors"
                            onClick={() => handleAction('delete')}
                        >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                            Delete
                        </button>
                    </>
                )}
            </div>

            <ConfirmDialog
                isOpen={showDeleteConfirm}
                title={`Delete ${item.type === 'folder' ? 'Folder' : 'Note'}`}
                message={(() => {
                    if (item.type === 'folder') {
                        const { noteCount, folderCount } = getDescendantCount(item.id);
                        const parts = [];
                        if (noteCount > 0) parts.push(`${noteCount} note${noteCount !== 1 ? 's' : ''}`);
                        if (folderCount > 0) parts.push(`${folderCount} subfolder${folderCount !== 1 ? 's' : ''}`);
                        if (parts.length > 0) {
                            return `Are you sure you want to delete "${item.name}" and its ${parts.join(' and ')}? This action cannot be undone.`;
                        }
                    }
                    return `Are you sure you want to delete "${item.name}"? This action cannot be undone.`;
                })()}
                confirmLabel="Delete"
                cancelLabel="Cancel"
                variant="danger"
                onConfirm={handleConfirmDelete}
                onCancel={handleCancelDelete}
            />
        </>
    );
};

export default ContextMenu;
