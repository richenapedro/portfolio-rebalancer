"use client";

type Props = {
  open: boolean;
  title: string;
  description?: string;
  confirmText?: string;
  cancelText?: string;
  onConfirm: () => void;
  onClose: () => void;
};

export default function ConfirmDialog(props: Props) {
  if (!props.open) return null;

  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-[2px]" onClick={props.onClose} aria-hidden="true" />
      <div className="absolute inset-0 flex items-center justify-center p-4">
        <div className="w-full max-w-md rounded-2xl border border-[var(--border)] bg-[var(--surface)] shadow-2xl">
          <div className="p-5">
            <div className="text-lg font-semibold text-[var(--text-primary)]">{props.title}</div>
            {props.description ? <div className="mt-2 text-sm text-[var(--text-muted)]">{props.description}</div> : null}

            <div className="mt-5 flex items-center justify-end gap-2">
              <button
                onClick={props.onClose}
                className="rounded-xl border border-[var(--border)] bg-[var(--surface-alt)] px-4 py-2 text-sm font-semibold
                           text-[var(--text-primary)] hover:bg-[var(--surface)]"
              >
                {props.cancelText ?? "Cancel"}
              </button>

              <button
                onClick={() => {
                  props.onConfirm();
                  props.onClose();
                }}
                className="rounded-xl bg-[var(--primary)] text-[var(--on-primary)] px-4 py-2 text-sm font-semibold
                           hover:bg-[var(--primary-hover)]"
              >
                {props.confirmText ?? "Confirm"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
