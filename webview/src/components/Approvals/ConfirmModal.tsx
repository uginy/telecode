import { useConfirmStore } from '../../stores/confirmStore';

export function ConfirmModal() {
  const { current, resolve } = useConfirmStore();

  if (!current) return null;

  return (
    <div className="modal-overlay">
      <div className="modal-card">
        <div className="modal-header">
          <h2>{current.title}</h2>
        </div>
        <div className="modal-body">
          <p>{current.description}</p>
        </div>
        <div className="modal-footer">
          <button className="modal-button secondary" onClick={() => resolve(false)}>
            {current.cancelLabel ?? 'Cancel'}
          </button>
          <button className="modal-button primary" onClick={() => resolve(true)}>
            {current.confirmLabel ?? 'Confirm'}
          </button>
        </div>
      </div>
    </div>
  );
}

