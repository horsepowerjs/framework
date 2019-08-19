import { WebSocket, SSLApp, App, HttpRequest } from 'uWebSockets.js'
import { SocketClient } from './SocketClient'
import { getConfig } from '@horsepower/server'
import { SocketSettings } from '.'
import { SocketRoom } from './SocketRoom'

export class SocketApp {
  public static clients: SocketClient[] = []
  public static rooms: SocketRoom[] = []

  public get length() { return SocketApp.clients.length }

  public listen() {
    // Get the configuration
    let settings = getConfig<SocketSettings>('sockets')
    // Get a socket SSL or Non-SSL application
    let app = settings && settings.ssl ? SSLApp(settings.ssl) : App()
    let port = settings && settings.port || 9000
    app
      // Listen for messages
      .ws('/*', {
        open: (ws, req) => this.join(ws, req),
        close: (ws, code, message) => this.leave(ws, code, message),
        message: (ws, message, isBinary) => this.message(ws, message, isBinary)
      })
      // Deny all Http requests
      .any('/*', (res, req) => res.end('Nothing to see here!'))
      // Listen on the users defined port otherwise use port 9000
      .listen(port, listenSocket => { })//listenSocket && console.log(`Listening on port ${port}`))
  }

  private join(ws: WebSocket, req: HttpRequest) {
    SocketApp.clients.push(new SocketClient(ws, req))
  }

  private leave(ws: WebSocket, code: number, message: ArrayBuffer) {
    let idx = SocketApp.clients.findIndex(i => i.ws == ws)
    if (idx > -1) {
      let sock = SocketApp.clients[idx]
      for (let room of SocketApp.rooms) room.leave(sock)
      SocketApp.clients.splice(idx, 1)
    }
  }

  private message(ws: WebSocket, message: ArrayBuffer, isBinary: boolean) {
    let sock = SocketApp.clients.find(i => i.ws == ws)
    if (!sock) return
  }
}