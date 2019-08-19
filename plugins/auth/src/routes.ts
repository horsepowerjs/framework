import { Router } from '@horsepower/router'

type Location = {
  to?: string
  location?: string
}

export interface AuthSettings {
  table?: string
  login?: string
  dbFields?: {
    id?: string
    username?: string
    password?: string
  }
  redirect?: {
    login?: {
      success: Location
      error: Location
    }
    join?: {
      success: Location
      error: Location
    }

  }
}

Router.group('auth', () => {
  Router.post('login', 'auth@login').name('auth.login')
  Router.post('join', 'auth@join').name('auth.join')

  Router.get('logout', 'auth@logout').name('auth.logout')
})