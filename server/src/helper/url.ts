import { Router } from '@horsepower/router'

export function route(name: string, parameters?: { [key: string]: string | number }) {
  let route = Router.findByName(name)
  if (!route) throw new Error('Route name not found')
  let path = route && route.pathAlias || '/'
  if (path instanceof RegExp) throw new Error('Path cannot be a RegExp')
  let params = route.params

  if (Object.keys(params).length > 0) {
    if (!parameters) throw new Error(`Missing parameters: ${Object.keys(route.params).join(', ')}`)
    for (let param in params) {
      if (!(param in parameters)) {
        throw new Error(`Missing parameter: "${param}"`)
      }
    }
  }

  if (parameters && typeof route.pathAlias == 'string') {
    let alias = route ? route.pathAlias : ''
    path = alias.split('/').map(item => item.startsWith(':') ? parameters[item.replace(/^:/, '')] : item).join('/')
  }
  return path
}

export function url(path: string) {

}