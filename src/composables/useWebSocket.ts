import { onBeforeUnmount } from 'vue'

interface SocketOptions {
  url: () => string | null
  protocols?: string | string[]
  onOpen?: (socket: WebSocket) => void
  onMessage?: (event: MessageEvent<string>) => void
  onError?: (event: Event) => void
  autoReconnect?: boolean
  maxDelayMs?: number
}

export function useWebSocket(options: SocketOptions) {
  let socket: WebSocket | null = null
  let reconnectAttempts = 0
  let reconnectTimer: number | null = null
  let manuallyClosed = false

  const clearReconnect = () => {
    if (reconnectTimer != null) {
      window.clearTimeout(reconnectTimer)
      reconnectTimer = null
    }
  }

  const connect = () => {
    const endpoint = options.url()
    if (!endpoint) {
      return
    }

    clearReconnect()
    socket = new WebSocket(endpoint, options.protocols)
    socket.onopen = () => {
      reconnectAttempts = 0
      options.onOpen?.(socket as WebSocket)
    }
    socket.onmessage = (event) => {
      options.onMessage?.(event as MessageEvent<string>)
    }
    socket.onerror = (event) => {
      options.onError?.(event)
    }
    socket.onclose = () => {
      socket = null
      if (options.autoReconnect !== false && !manuallyClosed) {
        const delay = Math.min(1000 * 2 ** reconnectAttempts, options.maxDelayMs ?? 15000)
        reconnectAttempts += 1
        reconnectTimer = window.setTimeout(connect, delay)
      }
    }
  }

  const disconnect = () => {
    manuallyClosed = true
    clearReconnect()
    socket?.close()
    socket = null
  }

  const reconnect = () => {
    manuallyClosed = false
    disconnect()
    manuallyClosed = false
    connect()
  }

  const send = (payload: string) => {
    if (socket?.readyState === WebSocket.OPEN) {
      socket.send(payload)
    }
  }

  onBeforeUnmount(disconnect)

  return { connect, disconnect, reconnect, send }
}
