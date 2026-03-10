import { useRef, useEffect, useCallback } from 'react'

interface PencilMessage {
  id: string
  type: string
  method: string
  payload?: unknown
}

interface PencilCanvasProps {
  className?: string
  onReady?: () => void
}

export default function PencilCanvas({ className, onReady }: PencilCanvasProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null)

  const sendToEditor = useCallback((msg: PencilMessage) => {
    iframeRef.current?.contentWindow?.postMessage(msg, '*')
  }, [])

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      const data = event.data
      if (!data || typeof data !== 'object') return
      // Messages from Pencil editor have {id, type, method, payload}
      if (data.type && data.method) {
        handleEditorMessage(data)
      }
    }

    function handleEditorMessage(msg: PencilMessage) {
      // Echo back responses for requests (Pencil expects request-response protocol)
      if (msg.id) {
        sendToEditor({ id: msg.id, type: 'response', method: msg.method, payload: null })
      }
    }

    window.addEventListener('message', handleMessage)
    return () => window.removeEventListener('message', handleMessage)
  }, [sendToEditor])

  return (
    <iframe
      ref={iframeRef}
      src="/pencil/"
      title="Pencil Design Canvas"
      className={className}
      onLoad={onReady}
      style={{ border: 'none', width: '100%', height: '100%' }}
      allow="clipboard-read; clipboard-write"
    />
  )
}
