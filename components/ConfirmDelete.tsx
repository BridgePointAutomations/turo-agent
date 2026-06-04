interface Props {
  label: string
  onConfirm: () => void
  onCancel: () => void
}

export default function ConfirmDelete({ label, onConfirm, onCancel }: Props) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs" style={{ color: '#64748B' }}>{label}</span>
      <button
        onClick={onConfirm}
        className="text-xs px-2.5 py-1 rounded-md font-medium text-white"
        style={{ backgroundColor: '#DC2626' }}>
        Confirm
      </button>
      <button
        onClick={onCancel}
        className="text-xs px-2.5 py-1 rounded-md font-medium"
        style={{ border: '1px solid #E2E8F0', color: '#64748B', backgroundColor: 'white' }}>
        Cancel
      </button>
    </div>
  )
}
