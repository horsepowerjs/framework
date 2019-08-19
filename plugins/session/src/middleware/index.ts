import { Client, getConfig, Middleware } from '@horsepower/server'
import { SessionSettings } from '..'
import { CookieSerializeOptions } from 'cookie'

export class StartSession implements Middleware {
  public async handle(client: Client) {
    let cfg = getConfig('session') as SessionSettings
    let cookie: CookieSerializeOptions = { path: '/', expires: new Date(Date.now() + (30 * 24 * 60 * 60 * 1000)) }
    if (cfg && cfg.cookie) cookie = Object.assign(cookie, cfg.cookie)
    if (client && client.session) {
      await client.session.start(cookie)
    }
    return true
  }

  public async terminate(client: Client) {
    client && client.session && await client.session.close()
    return true
  }
}

export class Auth implements Middleware {
  public async handle(client: Client) {
    // TODO: Implement auth verification
    return true
  }
}