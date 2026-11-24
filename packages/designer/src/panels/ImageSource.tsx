import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { MAX_EMBEDDED_IMAGE_BYTES, safeImageSource } from '@willowforms/core'

import { useAnnouncement } from '../announce.js'

export function ImageSource({
  id,
  value,
  onChange,
}: {
  id: string
  value: string
  onChange: (value: string) => void
}): ReactNode {
  const [draft, setDraft] = useState(value)
  const [seen, setSeen] = useState(value)
  const [error, setError] = useAnnouncement()
  const [failed, setFailed] = useState('')
  const request = useRef({ version: 0 })
  useEffect(() => {
    const pending = request.current
    pending.version++
    return () => {
      pending.version++
    }
  }, [value])
  if (seen !== value) {
    setSeen(value)
    setDraft(value)
    setError('')
  }
  const embedded = /^data:/i.test(value) && draft === value
  const source = safeImageSource(value)
  const problem =
    error ||
    (value && !source
      ? 'Use an http/https address, a relative path, or an embedded PNG, JPEG, WebP, or GIF up to 2 MiB.'
      : failed === source && source
        ? 'The image could not be loaded. Check its address or choose another file.'
        : '')
  const commit = (): void => {
    if (draft.trim() && !safeImageSource(draft)) {
      setError('Use an image URL or embed a PNG, JPEG, WebP, or GIF up to 2 MiB.')
      return
    }
    setError('')
    if (draft.trim() !== value) setFailed('')
    onChange(draft.trim())
  }
  return (
    <div className="fs-image-source">
      <input
        id={id}
        type="text"
        value={embedded ? 'Embedded image' : draft}
        readOnly={embedded}
        placeholder="https://… or /images/logo.svg"
        aria-invalid={!!problem}
        aria-describedby={problem ? id + '-error' : id + '-hint'}
        onChange={(event) => {
          request.current.version++
          setDraft(event.target.value)
          setError('')
        }}
        // Not while an error shows: nothing has changed since, and it would be read out again.
        onBlur={() => {
          if (!error) commit()
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault()
            commit()
          }
          if (event.key === 'Escape') {
            setDraft(value)
            setError('')
          }
        }}
      />
      {source && (
        <div className="fs-image-source__preview">
          <img
            src={source}
            alt="Preview"
            onError={() => setFailed(source)}
            onLoad={() => setFailed('')}
          />
        </div>
      )}
      <label className="fs-image-source__file">
        Embed an image
        <input
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif"
          onChange={(event) => {
            const file = event.target.files?.[0]
            event.target.value = ''
            if (!file) return
            const current = ++request.current.version
            if (
              file.size > MAX_EMBEDDED_IMAGE_BYTES ||
              !['image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(file.type)
            ) {
              setError('Choose a PNG, JPEG, WebP, or GIF up to 2 MiB. Link to SVG images by URL.')
              return
            }
            const reader = new FileReader()
            reader.onerror = () => {
              if (current === request.current.version) setError('The file could not be read.')
            }
            reader.onload = () => {
              if (current !== request.current.version) return
              const next =
                typeof reader.result === 'string' ? safeImageSource(reader.result) : undefined
              if (!next) {
                setError('The file is not a supported image.')
                return
              }
              setDraft(next)
              setError('')
              setFailed('')
              onChange(next)
            }
            reader.readAsDataURL(file)
          }}
        />
      </label>
      {(draft || value) && (
        <button
          type="button"
          onClick={() => {
            request.current.version++
            setDraft('')
            setError('')
            setFailed('')
            onChange('')
          }}
        >
          Remove image
        </button>
      )}
      <p id={id + '-hint'} className="fs-prop-row__hint">
        Linked images keep the form small. Embedded images are saved inside the form; no upload is
        required.
      </p>
      {problem && (
        <p id={id + '-error'} className="fs-prop-row__error" role="alert">
          {problem}
        </p>
      )}
    </div>
  )
}
