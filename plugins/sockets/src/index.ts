import { AppOptions } from 'uWebSockets.js'
import { Plugin, Client } from '@horsepower/server'
import { SocketApp } from './SocketApp'
import { SocketClient } from './SocketClient'

export interface SocketSettings {
  port?: number
  ssl?: AppOptions
}

export default class extends Plugin {
  public boot() {
    new SocketApp().listen()
  }

  public request(client: Client) {
    this.inject('socket', {})
  }
}