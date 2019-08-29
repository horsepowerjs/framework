import { Router } from '@horsepower/router'
import { getConfig } from '../helper'
import { AppSettings } from '../Server'

const appConfig = getConfig<AppSettings>('app')

// If the user defined their own route for "/lang/:locale",
// then don't attempt to add this one
if (!Router.routes().some(r => r.pathAlias == '/lang/:locale') && appConfig && appConfig.locale) {
  Router.get('/lang/:locale', client => {
    const defaultLocale = appConfig.locale as string

    // Get the referer
    let referer = <string>(client.request.headers.referer) || '/'

    // Set the application locale for the current client
    client.setLocale(client.route.params.locale || defaultLocale)
    // Redirect the client back to where it came from or
    // back to the root if a referer was not found
    return client.response.redirect.location(referer)
  }).name('locale')
}