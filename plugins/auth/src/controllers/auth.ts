import { Client, getConfig } from '@horsepower/server'
import { AuthSettings } from '../routes'
import { Login } from '../helpers/Login'

export default class {

  private config?: AuthSettings

  public constructor() {
    this.config = getConfig<AuthSettings>('auth')
  }

  public async login(client: Client) {
    let config = this.config
    let login = new Login(client)
    let success = await login.login(client.data.post('username'), client.data.post('password'))
    // Ajax request error response
    if (!success && client.ajax) return client.response.json({ success })
    // Ajax request success response
    else if (success && client.ajax) return client.response.json({ success })
    // Non-ajax request success response
    else if (success && !client.ajax && config && config.redirect && config.redirect.login) {
      if (config.redirect.login.success.to)
        return client.response.redirect.to(config.redirect.login.success.to)
      else if (config.redirect.login.success.location)
        return client.response.redirect.location(config.redirect.login.success.location)
      return client.response.redirect.location(config.login || '/')
    }
    // Non-ajax request error response
    else if (!success && !client.ajax && config && config.redirect && config.redirect.login) {
      if (config.redirect.login.error.to)
        return client.response.redirect.to(config.redirect.login.error.to)
      else if (config.redirect.login.error.location)
        return client.response.redirect.location(config.redirect.login.error.location)
      return client.response.redirect.location(config.login || '/')
    }
  }

  public async join(client: Client) {
    let config = this.config
    let login = new Login(client)
    let success = await login.join(client.data.post('username'), client.data.post('password'))
    // Ajax request error response
    if (!success && client.ajax) return client.response.json({ success })
    // Ajax request success response
    else if (success && client.ajax) return client.response.json({ success })
    // Non-ajax request success response
    else if (success && !client.ajax && config && config.redirect && config.redirect.join) {
      if (config.redirect.join.success.to)
        return client.response.redirect.to(config.redirect.join.success.to)
      else if (config.redirect.join.success.location)
        return client.response.redirect.location(config.redirect.join.success.location)
      return client.response.redirect.location(config.login || '/')
    }
    // Non-ajax request error response
    else if (!success && !client.ajax && config && config.redirect && config.redirect.join) {
      if (config.redirect.join.error.to)
        return client.response.redirect.to(config.redirect.join.error.to)
      else if (config.redirect.join.error.location)
        return client.response.redirect.location(config.redirect.join.error.location)
      return client.response.redirect.location(config.login || '/')
    }
  }
}