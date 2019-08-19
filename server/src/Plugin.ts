import { Client } from '@horsepower/server'

export abstract class Plugin {
  public abstract boot(): void

  public get routes() { return this._routes }
  public get controllers() { return this._controllers }
  public get middleware() { return this._middleware }
  public get property() { return this._property }

  public readonly name: string

  private _routes: string = ''
  private _controllers: string = ''
  private _middleware: string = ''
  private _property?: { name: string, value: any } = undefined

  public constructor(name: string) {
    this.name = name
  }

  public request(client: Client): void { }

  public inject(name: string, value: any) {
    this._property = { name, value }
  }

  public loadRoutes(location: string) {
    this._routes = location
  }

  public loadControllers(location: string) {
    this._controllers = location
  }

  public loadMiddleware(location: string) {
    this._middleware = location
  }

}