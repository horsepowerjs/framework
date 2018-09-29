import { Server } from './Server'

export { AppSettings, RouterSettings, ViewSettings } from './Server'
export * from './helper'
export * from './Client'

export function start() {
  Server.start()
}

export function stop() {
  Server.stop()
}