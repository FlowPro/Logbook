import React, { useRef, useState, useEffect } from 'react'
import { Upload, X, FileText, ZoomIn, Download } from 'lucide-react'
import type { DocumentAttachment } from '../../db/models'

interface FileUploadProps {
  label?: string
  onUpload: (attachment: DocumentAttachment) => void
  onRemove?: (index: number) => void
  attachments?: DocumentAttachment[]
  accept?: string
  multiple?: boolean
  disabled?: boolean
}

function AttachmentLightbox({ att, onClose }: { att: DocumentAttachment; onClose: () => void }) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  function handleDownload() {
    const a = document.createElement('a')
    a.href = att.data
    a.download = att.name
    a.click()
  }

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col bg-black/90"
      onClick={onClose}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-4 py-3 bg-black/60"
        onClick={e => e.stopPropagation()}
      >
        <span className="text-white text-sm font-medium truncate max-w-xs">{att.name}</span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleDownload}
            className="p-2 rounded-lg text-gray-300 hover:text-white hover:bg-white/10 transition-colors"
            title="Herunterladen"
          >
            <Download className="w-5 h-5" />
          </button>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-lg text-gray-300 hover:text-white hover:bg-white/10 transition-colors"
            title="Schließen (Esc)"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 flex items-center justify-center p-4 overflow-auto" onClick={onClose}>
        {att.type.startsWith('image/') ? (
          <img
            src={att.data}
            alt={att.name}
            className="max-w-full max-h-full object-contain rounded shadow-2xl"
            style={{ imageOrientation: 'from-image' }}
            onClick={e => e.stopPropagation()}
          />
        ) : att.type === 'application/pdf' ? (
          <div
            className="w-full max-w-3xl flex-shrink-0 rounded overflow-hidden shadow-2xl bg-white"
            style={{ height: 'calc(100vh - 120px)' }}
            onClick={e => e.stopPropagation()}
          >
            <iframe
              src={att.data + '#view=FitV&scrollbar=1'}
              title={att.name}
              className="w-full h-full"
            />
          </div>
        ) : (
          <iframe
            src={att.data}
            title={att.name}
            className="w-full h-full rounded shadow-2xl bg-white"
            onClick={e => e.stopPropagation()}
          />
        )}
      </div>
    </div>
  )
}

export function FileUpload({
  label,
  onUpload,
  onRemove,
  attachments = [],
  accept = '*/*',
  multiple = false,
  disabled = false,
}: FileUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [viewing, setViewing] = useState<DocumentAttachment | null>(null)

  function handleFile(file: File) {
    const reader = new FileReader()
    reader.onload = (e) => {
      const data = e.target?.result as string
      onUpload({
        id: crypto.randomUUID(),
        name: file.name,
        type: file.type,
        data,
        size: file.size,
        uploadedAt: new Date().toISOString(),
      })
    }
    reader.readAsDataURL(file)
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files
    if (!files) return
    Array.from(files).forEach(handleFile)
    if (inputRef.current) inputRef.current.value = ''
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    Array.from(e.dataTransfer.files).forEach(handleFile)
  }

  function formatSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  function openAttachment(att: DocumentAttachment) {
    if (att.type.startsWith('image/') || att.type === 'application/pdf') {
      setViewing(att)
    } else {
      // For other file types, trigger a download
      const a = document.createElement('a')
      a.href = att.data
      a.download = att.name
      a.click()
    }
  }

  return (
    <div>
      {label && <label className="label">{label}</label>}
      {disabled ? (
        <div className="border-2 border-dashed border-gray-200 dark:border-gray-700 rounded-lg p-6 text-center bg-gray-50 dark:bg-gray-800/50">
          <Upload className="w-8 h-8 mx-auto text-gray-300 dark:text-gray-600 mb-2" />
          <p className="text-sm text-gray-400 dark:text-gray-500">Im Demo-Modus nicht verfügbar</p>
        </div>
      ) : (
        <div
          onDrop={handleDrop}
          onDragOver={e => e.preventDefault()}
          onClick={() => inputRef.current?.click()}
          className="border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg p-6 text-center cursor-pointer
                     hover:border-blue-400 dark:hover:border-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950/30 transition-colors"
        >
          <Upload className="w-8 h-8 mx-auto text-gray-400 mb-2" />
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Datei hier ablegen oder klicken zum Auswählen
          </p>
          <input
            ref={inputRef}
            type="file"
            accept={accept}
            multiple={multiple}
            onChange={handleChange}
            className="hidden"
          />
        </div>
      )}

      {attachments.length > 0 && (
        <ul className="mt-3 space-y-2">
          {attachments.map((att, i) => (
            <li key={att.id ?? i} className="flex items-center gap-3 p-2.5 bg-gray-50 dark:bg-gray-800 rounded-lg">
              <button
                type="button"
                onClick={() => openAttachment(att)}
                className="relative group flex-shrink-0 rounded overflow-hidden focus:outline-none focus:ring-2 focus:ring-blue-500"
                title="Ansehen"
              >
                {att.type.startsWith('image/') ? (
                  <img src={att.data} alt={att.name} className="w-10 h-10 object-cover" style={{ imageOrientation: 'from-image' }} />
                ) : (
                  <div className="w-10 h-10 flex items-center justify-center bg-blue-100 dark:bg-blue-900">
                    <FileText className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                  </div>
                )}
                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 flex items-center justify-center transition-colors">
                  <ZoomIn className="w-4 h-4 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>
              </button>
              <div className="flex-1 min-w-0">
                <button
                  type="button"
                  onClick={() => openAttachment(att)}
                  className="text-left w-full focus:outline-none"
                >
                  <p className="text-sm font-medium truncate hover:text-blue-600 dark:hover:text-blue-400 transition-colors">{att.name}</p>
                </button>
                <p className="text-xs text-gray-500">{formatSize(att.size)}</p>
              </div>
              {onRemove && (
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); onRemove(i) }}
                  className="p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
                >
                  <X className="w-4 h-4 text-gray-500" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {viewing && (
        <AttachmentLightbox att={viewing} onClose={() => setViewing(null)} />
      )}
    </div>
  )
}
