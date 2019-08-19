import { CookieSerializeOptions } from 'cookie'
import { Plugin } from '@horsepower/server'
import * as path from 'path'

export * from './Session'

export interface SessionSettings {
  store: 'file' | string
  cookie: CookieSerializeOptions
}

export default class extends Plugin {
  boot() {
    this.loadMiddleware(path.join(__dirname, 'middleware'))
  }
}